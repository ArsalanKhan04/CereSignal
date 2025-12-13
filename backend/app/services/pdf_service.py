import os
from pathlib import Path
from datetime import datetime
from typing import Optional
from reportlab.lib.pagesizes import letter, A4
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import inch, mm
from reportlab.lib.colors import HexColor, black
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, PageBreak
from reportlab.platypus.flowables import HRFlowable
from reportlab.lib.enums import TA_LEFT, TA_CENTER, TA_RIGHT, TA_JUSTIFY
from reportlab.pdfgen import canvas
from reportlab.lib import colors

from app.core.config import settings
from app.models.report import EEGReport
from app.models.signal import SignalFile
from app.models.auth import AuthUser


class PDFReportGenerator:
    """Generate professional PDF reports for EEG analysis"""
    
    def __init__(self):
        self.reports_dir = Path("reports")
        self.reports_dir.mkdir(exist_ok=True)
        
        # Define styles
        self.styles = getSampleStyleSheet()
        self._setup_custom_styles()
    
    def _setup_custom_styles(self):
        """Setup custom paragraph styles for the report"""
        
        # Hospital/Department Header [cite: 3]
        self.styles.add(ParagraphStyle(
            name='HospitalHeader',
            parent=self.styles['Heading1'],
            fontSize=16,
            spaceAfter=6,
            alignment=TA_CENTER,
            textColor=black,
            fontName='Helvetica-Bold',
            textTransform='uppercase'
        ))

        # Sub-header (e.g. Routine EEG Report) [cite: 7]
        self.styles.add(ParagraphStyle(
            name='ReportType',
            parent=self.styles['Normal'],
            fontSize=12,
            spaceAfter=20,
            alignment=TA_CENTER,
            textColor=black,
            fontName='Helvetica-Bold',
            textTransform='uppercase'
        ))
        
        # Section Titles (INDICATIONS, TECHNIQUE, etc.) [cite: 14, 15]
        self.styles.add(ParagraphStyle(
            name='SectionTitle',
            parent=self.styles['Normal'],
            fontSize=11,
            spaceAfter=4,
            spaceBefore=12,
            textColor=black,
            fontName='Helvetica-Bold',
            textTransform='uppercase'
        ))
        
        # Normal Body Text
        self.styles.add(ParagraphStyle(
            name='ClinicalText',
            parent=self.styles['Normal'],
            fontSize=11,
            leading=14,
            spaceAfter=8,
            alignment=TA_LEFT,
            fontName='Helvetica'
        ))
        
        # Doctor Signature Text [cite: 27-32]
        self.styles.add(ParagraphStyle(
            name='SignatureText',
            parent=self.styles['Normal'],
            fontSize=10,
            leading=12,
            alignment=TA_RIGHT,
            fontName='Helvetica'
        ))

        # Disclaimer/Note Text [cite: 26]
        self.styles.add(ParagraphStyle(
            name='Disclaimer',
            parent=self.styles['Normal'],
            fontSize=9,
            leading=11,
            spaceBefore=10,
            alignment=TA_LEFT,
            fontName='Helvetica-Oblique'
        ))
    
    def generate_report_pdf(self, report: EEGReport, signal_file: SignalFile, doctor: AuthUser) -> str:
        """Generate a PDF report for the given EEG report"""
        
        # Create filename
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        filename = f"EEG_Report_{report.id}_{timestamp}.pdf"
        filepath = self.reports_dir / filename
        
        # Create PDF document
        doc = SimpleDocTemplate(
            str(filepath),
            pagesize=A4,
            rightMargin=50,
            leftMargin=50,
            topMargin=50,
            bottomMargin=50
        )
        
        # Build content
        story = []
        
        # 1. Header Section
        story.extend(self._create_header())
        
        # 2. Patient & Metadata Grid
        story.extend(self._create_metadata_grid(report, signal_file))
        
        # Separator line
        story.append(HRFlowable(width="100%", thickness=1, color=black, spaceBefore=5, spaceAfter=15))
        
        # 3. Clinical Sections (Indications, Technique, Findings)
        story.extend(self._create_clinical_body(report))
        
        # 4. Footer & Signature
        story.extend(self._create_signature_block(doctor))
        
        # Build PDF
        doc.build(story, onFirstPage=self._add_footer, onLaterPages=self._add_footer)
        
        return str(filepath)
    
    def _create_header(self) -> list:
        """Create the hospital/department header"""
        story = []
        # Matches "DEPARTMENT OF NEUROPHYSIOLOGY" [cite: 3]
        story.append(Paragraph("DEPARTMENT OF NEUROPHYSIOLOGY", self.styles['HospitalHeader']))
        # Matches "Routine EEG Report" [cite: 7]
        story.append(Paragraph("ROUTINE EEG REPORT", self.styles['ReportType']))
        return story
    
    def _create_metadata_grid(self, report: EEGReport, signal_file: SignalFile) -> list:
        """Create the patient and test details grid similar to the reference"""
        
        # Format dates
        rep_date = report.report_date.strftime("%d-%m-%Y") if report.report_date else datetime.now().strftime("%d-%m-%Y")
        
        # Structure data to match the 4-column layout in reference [cite: 1, 5, 6, 10, 12]
        data = [
            [
                Paragraph("<b>Name:</b>", self.styles['Normal']),
                Paragraph(report.patient_name or "N/A", self.styles['Normal']),
                Paragraph("<b>Date/ID:</b>", self.styles['Normal']),
                Paragraph(f"{rep_date} / #{report.id}", self.styles['Normal'])
            ],
            [
                Paragraph("<b>Age/Sex:</b>", self.styles['Normal']),
                Paragraph(f"{report.patient_age or '--'} Yrs / {report.patient_gender or '--'}", self.styles['Normal']),
                Paragraph("<b>Ref By:</b>", self.styles['Normal']),
                Paragraph(report.ref_physician or "Direct", self.styles['Normal'])
            ],
            [
                Paragraph("<b>File:</b>", self.styles['Normal']),
                Paragraph(signal_file.original_filename, self.styles['Normal']),
                Paragraph("<b>Status:</b>", self.styles['Normal']),
                Paragraph("Finalized" if report.is_finalized else "Draft", self.styles['Normal'])
            ]
        ]
        
        # Create table
        table = Table(data, colWidths=[1*inch, 2.5*inch, 1*inch, 2.5*inch])
        table.setStyle(TableStyle([
            ('VALIGN', (0, 0), (-1, -1), 'TOP'),
            ('TOPPADDING', (0, 0), (-1, -1), 2),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 2),
            ('LEFTPADDING', (0, 0), (-1, -1), 0),
        ]))
        
        return [table, Spacer(1, 5)]

    def _create_clinical_body(self, report: EEGReport) -> list:
        """Create the main clinical content sections"""
        story = []
        
        # INDICATIONS [cite: 14]
        if report.indications:
            story.append(Paragraph("INDICATIONS:", self.styles['SectionTitle']))
            story.append(Paragraph(report.indications, self.styles['ClinicalText']))
            
        # TECHNIQUE [cite: 15]
        technique_text = report.technique or "Multichannel digital EEG recording using the international 10-20 electrode placement system."
        story.append(Paragraph("TECHNIQUE:", self.styles['SectionTitle']))
        story.append(Paragraph(technique_text, self.styles['ClinicalText']))
        
        # FACTUAL REPORT [cite: 17]
        if report.factual_report:
            story.append(Paragraph("FACTUAL REPORT:", self.styles['SectionTitle']))
            story.append(Paragraph(report.factual_report, self.styles['ClinicalText']))
        
        story.append(Spacer(1, 10))
        
        # IMPRESSION [cite: 24]
        story.append(Paragraph("IMPRESSION:", self.styles['SectionTitle']))
        
        # Style impression based on normal/abnormal
        # Backwards-compatible: some reports may not have 'impression_details'
        imp_text = None
        if hasattr(report, 'impression_details') and getattr(report, 'impression_details'):
            imp_text = report.impression_details
        else:
            if report.impression == 'normal':
                imp_text = 'Normal study — no epileptiform abnormalities detected.'
            elif report.impression == 'abnormal':
                if report.factual_report:
                    # Use a brief excerpt from the factual report as impression detail
                    excerpt = report.factual_report.strip().replace('\n', ' ')
                    imp_text = ('Abnormalities detected — ' + excerpt[:500]) if excerpt else 'Abnormalities detected — see factual report for details.'
                else:
                    imp_text = 'Abnormalities detected — see factual report for details.'
            else:
                imp_text = 'No impression available.'

        story.append(Paragraph(f"<b>{imp_text}</b>", self.styles['ClinicalText']))
        
        # Standard disclaimer/Note found in reference [cite: 26]
        note_text = "Note: A single normal EEG can neither confirm nor refute the diagnosis of Epilepsy."
        story.append(Paragraph(note_text, self.styles['Disclaimer']))
        
        return story

    def _create_signature_block(self, doctor: AuthUser) -> list:
        """Create the bottom right signature block"""
        story = []
        story.append(Spacer(1, 40))
        
        # Doctor details
        name = f"{doctor.first_name or ''} {doctor.last_name or ''}".strip() or doctor.username
        # Use titles from reference style or doctor object
        title_lines = [
            f"<b>{name}</b>",
            doctor.specialization or "Neurologist",
            doctor.hospital_affiliation or "Department of Neurophysiology"
        ]
        
        # Create a table to force alignment to the right
        # We use a table so the text block stays together
        sig_data = [[Paragraph("<br/>".join(title_lines), self.styles['SignatureText'])]]
        
        sig_table = Table(sig_data, colWidths=[7*inch]) # Full width
        sig_table.setStyle(TableStyle([
            ('ALIGN', (0, 0), (-1, -1), 'RIGHT'),
        ]))
        
        story.append(sig_table)
        return story
    
    def _add_footer(self, canvas, doc):
        """Add minimal page numbers"""
        canvas.saveState()
        canvas.setFont('Helvetica', 8)
        page_num = canvas.getPageNumber()
        text = f"Page {page_num}"
        canvas.drawRightString(200*mm, 10*mm, text)
        canvas.restoreState()

# Global instance
pdf_generator = PDFReportGenerator()
