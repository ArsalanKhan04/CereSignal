import os
from datetime import datetime
from pathlib import Path
from xml.sax.saxutils import escape

from reportlab.lib.colors import black
from reportlab.lib.enums import TA_CENTER, TA_LEFT, TA_RIGHT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import inch, mm
from reportlab.platypus import (
    Image,
    Paragraph,
    SimpleDocTemplate,
    Spacer,
    Table,
    TableStyle,
)
from reportlab.platypus.flowables import HRFlowable

from app.core.logging_config import logger
from app.models.auth import AuthUser
from app.models.report import EEGReport
from app.models.signal import SignalFile


class PDFReportGenerator:
    """Generate professional PDF reports for EEG analysis"""

    def __init__(self):

        # Define styles
        self.styles = getSampleStyleSheet()
        self._setup_custom_styles()

    def _setup_custom_styles(self):
        """Setup custom paragraph styles for the report"""

        # Hospital/Department Header [cite: 3]
        self.styles.add(
            ParagraphStyle(
                name="HospitalHeader",
                parent=self.styles["Heading1"],
                fontSize=16,
                spaceAfter=6,
                alignment=TA_CENTER,
                textColor=black,
                fontName="Helvetica-Bold",
                textTransform="uppercase",
            )
        )

        # Sub-header (e.g. Routine EEG Report) [cite: 7]
        self.styles.add(
            ParagraphStyle(
                name="ReportType",
                parent=self.styles["Normal"],
                fontSize=12,
                spaceAfter=20,
                alignment=TA_CENTER,
                textColor=black,
                fontName="Helvetica-Bold",
                textTransform="uppercase",
            )
        )

        # Section Titles (INDICATIONS, TECHNIQUE, etc.) [cite: 14, 15]
        self.styles.add(
            ParagraphStyle(
                name="SectionTitle",
                parent=self.styles["Normal"],
                fontSize=11,
                spaceAfter=4,
                spaceBefore=12,
                textColor=black,
                fontName="Helvetica-Bold",
                textTransform="uppercase",
            )
        )

        # Normal Body Text
        self.styles.add(
            ParagraphStyle(
                name="ClinicalText",
                parent=self.styles["Normal"],
                fontSize=11,
                leading=14,
                spaceAfter=8,
                alignment=TA_LEFT,
                fontName="Helvetica",
            )
        )

        # Doctor Signature Text [cite: 27-32]
        self.styles.add(
            ParagraphStyle(
                name="SignatureText",
                parent=self.styles["Normal"],
                fontSize=10,
                leading=12,
                alignment=TA_RIGHT,
                fontName="Helvetica",
            )
        )

        # Disclaimer/Note Text [cite: 26]
        self.styles.add(
            ParagraphStyle(
                name="Disclaimer",
                parent=self.styles["Normal"],
                fontSize=9,
                leading=11,
                spaceBefore=10,
                alignment=TA_LEFT,
                fontName="Helvetica-Oblique",
            )
        )

    def generate_report_pdf(
        self, report: EEGReport, signal_file: SignalFile, doctor: AuthUser
    ) -> str:
        """Generate a PDF report and upload to Supabase Storage. Returns storage object path."""
        import tempfile

        from app.services.storage_service import SIGNALS_BUCKET, storage_service

        source_name = signal_file.original_filename or signal_file.filename
        stem = Path(Path(source_name).name).stem or f"EEG_Report_{report.id}"
        filename = f"{stem}.pdf"

        # Write to a temp file, then upload
        tmp = tempfile.NamedTemporaryFile(suffix=".pdf", delete=False)
        tmp_path = tmp.name
        tmp.close()

        # Create PDF document
        doc = SimpleDocTemplate(
            tmp_path,
            pagesize=A4,
            rightMargin=50,
            leftMargin=50,
            topMargin=50,
            bottomMargin=50,
        )

        # Build content — collect temp paths for embedded images so we can clean up after build
        temp_image_paths = []
        story = []

        story.extend(self._create_header())
        story.extend(self._create_metadata_grid(report, signal_file))
        story.append(
            HRFlowable(
                width="100%", thickness=1, color=black, spaceBefore=5, spaceAfter=15
            )
        )
        story.extend(self._create_clinical_body(report))
        story.extend(self._create_topomap_section(signal_file, temp_image_paths))
        story.extend(self._create_bookmark_section(signal_file, temp_image_paths))
        story.extend(self._create_signature_block(report, doctor))

        doc.build(story, onFirstPage=self._add_footer, onLaterPages=self._add_footer)

        # Clean up embedded image temp files
        for p in temp_image_paths:
            try:
                os.unlink(p)
            except OSError:
                pass

        # Upload PDF to Supabase and remove local temp. Keyed by report id: this was
        # reports/<upload name>.pdf, so two hospitals that each uploaded "EEG.edf"
        # wrote the same object and each downloaded whichever report was built last.
        object_path = f"reports/{report.id}/{filename}"
        with open(tmp_path, "rb") as f:
            storage_service.upload(SIGNALS_BUCKET, object_path, f.read())
        try:
            os.unlink(tmp_path)
        except OSError:
            pass

        return object_path

    def _create_header(self) -> list:
        """Create the hospital/department header"""
        story = []
        # Matches "DEPARTMENT OF NEUROPHYSIOLOGY" [cite: 3]
        story.append(
            Paragraph("DEPARTMENT OF NEUROPHYSIOLOGY", self.styles["HospitalHeader"])
        )
        # Matches "Routine EEG Report" [cite: 7]
        story.append(Paragraph("ROUTINE EEG REPORT", self.styles["ReportType"]))
        return story

    def _create_metadata_grid(self, report: EEGReport, signal_file: SignalFile) -> list:
        """Create the patient and test details grid similar to the reference"""

        # Format dates
        rep_date = (
            report.report_date.strftime("%d-%m-%Y")
            if report.report_date
            else datetime.now().strftime("%d-%m-%Y")
        )

        # Structure data to match the 4-column layout in reference [cite: 1, 5, 6, 10, 12]
        # Every user-supplied string is escape()d: Paragraph parses its text as
        # markup, and an <img src="..."> in a report field would embed any image the
        # server can read — another hospital's bookmarks included.
        data = [
            [
                Paragraph("<b>Name:</b>", self.styles["Normal"]),
                Paragraph(escape(report.patient_name or "N/A"), self.styles["Normal"]),
                Paragraph("<b>Date/ID:</b>", self.styles["Normal"]),
                Paragraph(f"{rep_date} / #{report.id}", self.styles["Normal"]),
            ],
            [
                Paragraph("<b>Age/Sex:</b>", self.styles["Normal"]),
                Paragraph(
                    escape(f"{report.patient_age or '--'} Yrs / {report.patient_gender or '--'}"),
                    self.styles["Normal"],
                ),
                Paragraph("<b>Ref By:</b>", self.styles["Normal"]),
                Paragraph(escape(report.ref_physician or "Direct"), self.styles["Normal"]),
            ],
            [
                Paragraph("<b>File:</b>", self.styles["Normal"]),
                Paragraph(escape(signal_file.original_filename), self.styles["Normal"]),
                Paragraph("", self.styles["Normal"]),
                Paragraph("", self.styles["Normal"]),
            ],
        ]

        # Create table
        table = Table(data, colWidths=[1 * inch, 2.5 * inch, 1 * inch, 2.5 * inch])
        table.setStyle(
            TableStyle(
                [
                    ("VALIGN", (0, 0), (-1, -1), "TOP"),
                    ("TOPPADDING", (0, 0), (-1, -1), 2),
                    ("BOTTOMPADDING", (0, 0), (-1, -1), 2),
                    ("LEFTPADDING", (0, 0), (-1, -1), 0),
                ]
            )
        )

        return [table, Spacer(1, 5)]

    def _create_bookmark_section(self, signal_file: SignalFile, temp_paths: list) -> list:
        """Create bookmark section with attached EEG images downloaded from Supabase."""
        import tempfile

        from app.services.storage_service import ASSETS_BUCKET, storage_service

        story = []
        bookmarks = list(signal_file.bookmarks) if hasattr(signal_file, "bookmarks") else []
        if not bookmarks:
            return story

        story.append(Paragraph("EEG BOOKMARKS:", self.styles["SectionTitle"]))

        for bookmark in bookmarks:
            if bookmark.image_path:
                try:
                    data = storage_service.download(ASSETS_BUCKET, bookmark.image_path)
                    tmp = tempfile.NamedTemporaryFile(suffix=".png", delete=False)
                    tmp.write(data)
                    tmp.flush()
                    tmp.close()
                    temp_paths.append(tmp.name)
                    story.append(Image(tmp.name, width=6.5 * inch, height=3.2 * inch))
                except Exception as exc:
                    # A missing or unreadable screenshot must not sink the whole
                    # report, but it should leave a trace.
                    logger.warning(
                        "pdf: skipped bookmark image %s: %s", bookmark.image_path, exc
                    )
            if bookmark.comment:
                story.append(Paragraph(escape(bookmark.comment), self.styles["ClinicalText"]))
            story.append(Spacer(1, 8))

        return story

    def _create_topomap_section(self, signal_file: SignalFile, temp_paths: list) -> list:
        """Create topomap section, downloading the PNG from Supabase."""
        import tempfile

        from app.services.storage_service import ASSETS_BUCKET, storage_service

        story = []
        base = os.path.splitext(signal_file.filename)[0]
        object_path = f"topomaps/{base}_topomap.png"

        try:
            data = storage_service.download(ASSETS_BUCKET, object_path)
        except Exception:
            return story

        tmp = tempfile.NamedTemporaryFile(suffix=".png", delete=False)
        tmp.write(data)
        tmp.flush()
        tmp.close()
        temp_paths.append(tmp.name)

        story.append(Paragraph("BRAIN ACTIVITY TOPOMAP:", self.styles["SectionTitle"]))
        story.append(Image(tmp.name, width=5 * inch, height=4 * inch))
        story.append(
            Paragraph(
                "Topographic map showing spatial distribution of detected brain activity patterns.",
                self.styles["ClinicalText"],
            )
        )
        story.append(Spacer(1, 10))

        return story

    def _create_clinical_body(self, report: EEGReport) -> list:
        """Create the main clinical content sections"""
        story = []

        # INDICATIONS [cite: 14]
        if report.indications:
            story.append(Paragraph("INDICATIONS:", self.styles["SectionTitle"]))
            story.append(Paragraph(escape(report.indications), self.styles["ClinicalText"]))

        # TECHNIQUE [cite: 15]
        technique_text = (
            report.technique
            or "Multichannel digital EEG recording using the international 10-20 electrode placement system."
        )
        story.append(Paragraph("TECHNIQUE:", self.styles["SectionTitle"]))
        story.append(Paragraph(escape(technique_text), self.styles["ClinicalText"]))

        # FACTUAL REPORT [cite: 17] — LLM output, so escaped like any user text
        if report.factual_report:
            story.append(Paragraph("FACTUAL REPORT:", self.styles["SectionTitle"]))
            story.append(Paragraph(escape(report.factual_report), self.styles["ClinicalText"]))

        story.append(Spacer(1, 10))

        # IMPRESSION [cite: 24]
        story.append(Paragraph("IMPRESSION:", self.styles["SectionTitle"]))

        # Display the impression text
        imp_text = escape(report.impression or "No impression available.")
        story.append(Paragraph(f"<b>{imp_text}</b>", self.styles["ClinicalText"]))

        # Standard disclaimer/Note found in reference [cite: 26]
        note_text = "Note: A single normal EEG can neither confirm nor refute the diagnosis of Epilepsy."
        story.append(Paragraph(note_text, self.styles["Disclaimer"]))

        return story

    def _create_signature_block(self, report: EEGReport, doctor: AuthUser) -> list:
        """Create the bottom right signature block"""
        story = []
        story.append(Spacer(1, 40))

        # Doctor details
        if report.doctor_info:
            title_lines = [
                escape(line.strip()) for line in report.doctor_info.split("|") if line.strip()
            ]
            if title_lines:
                title_lines[0] = f"<b>{title_lines[0]}</b>"
        else:
            name = (
                f"{doctor.first_name or ''} {doctor.last_name or ''}".strip()
                or doctor.username
            )
            title_lines = [
                f"<b>{escape(name)}</b>",
                escape(doctor.specialization or "Neurologist"),
                escape(doctor.hospital_affiliation or "Department of Neurophysiology"),
            ]

        # Create a table to force alignment to the right
        # We use a table so the text block stays together
        sig_data = [
            [Paragraph("<br/>".join(title_lines), self.styles["SignatureText"])]
        ]

        sig_table = Table(sig_data, colWidths=[7 * inch])  # Full width
        sig_table.setStyle(
            TableStyle(
                [
                    ("ALIGN", (0, 0), (-1, -1), "RIGHT"),
                ]
            )
        )

        story.append(sig_table)
        return story

    def _add_footer(self, canvas, doc):
        """Add minimal page numbers"""
        canvas.saveState()
        canvas.setFont("Helvetica", 8)
        page_num = canvas.getPageNumber()
        text = f"Page {page_num}"
        canvas.drawRightString(200 * mm, 10 * mm, text)
        canvas.restoreState()


# Global instance
pdf_generator = PDFReportGenerator()
