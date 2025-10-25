"""
PDF generation service for EEG reports
"""

import os
from pathlib import Path
from datetime import datetime
from typing import Optional
from reportlab.lib.pagesizes import letter, A4
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import inch, mm
from reportlab.lib.colors import HexColor, black, darkblue, darkred
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
        
        # Title style
        self.styles.add(ParagraphStyle(
            name='ReportTitle',
            parent=self.styles['Heading1'],
            fontSize=24,
            spaceAfter=30,
            alignment=TA_CENTER,
            textColor=HexColor('#2c3e50'),
            fontName='Helvetica-Bold'
        ))
        
        # Section header style
        self.styles.add(ParagraphStyle(
            name='SectionHeader',
            parent=self.styles['Heading2'],
            fontSize=16,
            spaceAfter=12,
            spaceBefore=20,
            textColor=HexColor('#34495e'),
            fontName='Helvetica-Bold',
            borderWidth=1,
            borderColor=HexColor('#bdc3c7'),
            borderPadding=8,
            backColor=HexColor('#ecf0f1')
        ))
        
        # Subsection header style
        self.styles.add(ParagraphStyle(
            name='SubsectionHeader',
            parent=self.styles['Heading3'],
            fontSize=14,
            spaceAfter=8,
            spaceBefore=12,
            textColor=HexColor('#2c3e50'),
            fontName='Helvetica-Bold'
        ))
        
        # Normal text style
        self.styles.add(ParagraphStyle(
            name='ReportText',
            parent=self.styles['Normal'],
            fontSize=11,
            spaceAfter=6,
            alignment=TA_JUSTIFY,
            fontName='Helvetica'
        ))
        
        # Label style for form fields
        self.styles.add(ParagraphStyle(
            name='FieldLabel',
            parent=self.styles['Normal'],
            fontSize=10,
            fontName='Helvetica-Bold',
            textColor=HexColor('#7f8c8d')
        ))
        
        # Value style for form fields
        self.styles.add(ParagraphStyle(
            name='FieldValue',
            parent=self.styles['Normal'],
            fontSize=11,
            fontName='Helvetica',
            leftIndent=20,
            spaceAfter=8
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
            rightMargin=72,
            leftMargin=72,
            topMargin=72,
            bottomMargin=18
        )
        
        # Build content
        story = []
        
        # Add header
        story.extend(self._create_header(report, signal_file, doctor))
        
        # Add patient information
        story.extend(self._create_patient_section(report))
        
        # Add report information
        story.extend(self._create_report_section(report))
        
        # Add clinical findings
        story.extend(self._create_clinical_section(report))
        
        # Add doctor information
        story.extend(self._create_doctor_section(report, doctor))
        
        # Add footer
        story.extend(self._create_footer(report))
        
        # Build PDF
        doc.build(story, onFirstPage=self._add_page_number, onLaterPages=self._add_page_number)
        
        return str(filepath)
    
    def _create_header(self, report: EEGReport, signal_file: SignalFile, doctor: AuthUser) -> list:
        """Create the report header"""
        story = []
        
        # Title
        story.append(Paragraph("EEG ANALYSIS REPORT", self.styles['ReportTitle']))
        
        # Report metadata table
        report_date = report.report_date.strftime("%B %d, %Y") if report.report_date else "N/A"
        created_date = report.created_at.strftime("%B %d, %Y at %I:%M %p") if report.created_at else "N/A"
        
        header_data = [
            ['Report ID:', f'#{report.id}', 'Date:', report_date],
            ['File:', signal_file.original_filename, 'Generated:', created_date],
            ['Doctor:', f"{doctor.first_name or ''} {doctor.last_name or ''}".strip() or doctor.username, 'Status:', 'Finalized' if report.is_finalized else 'Draft']
        ]
        
        header_table = Table(header_data, colWidths=[1.2*inch, 2.5*inch, 1.2*inch, 2.5*inch])
        header_table.setStyle(TableStyle([
            ('ALIGN', (0, 0), (-1, -1), 'LEFT'),
            ('FONTNAME', (0, 0), (0, -1), 'Helvetica-Bold'),
            ('FONTNAME', (2, 0), (2, -1), 'Helvetica-Bold'),
            ('FONTSIZE', (0, 0), (-1, -1), 10),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 6),
            ('TOPPADDING', (0, 0), (-1, -1), 6),
        ]))
        
        story.append(header_table)
        story.append(Spacer(1, 20))
        
        return story
    
    def _create_patient_section(self, report: EEGReport) -> list:
        """Create the patient information section"""
        story = []
        
        story.append(Paragraph("PATIENT INFORMATION", self.styles['SectionHeader']))
        
        # Patient details table
        patient_data = [
            ['Patient Name:', report.patient_name or 'N/A'],
            ['Age:', str(report.patient_age) if report.patient_age else 'N/A'],
            ['Gender:', report.patient_gender or 'N/A'],
        ]
        
        patient_table = Table(patient_data, colWidths=[1.5*inch, 4*inch])
        patient_table.setStyle(TableStyle([
            ('ALIGN', (0, 0), (0, -1), 'LEFT'),
            ('ALIGN', (1, 0), (1, -1), 'LEFT'),
            ('FONTNAME', (0, 0), (0, -1), 'Helvetica-Bold'),
            ('FONTSIZE', (0, 0), (-1, -1), 11),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 4),
            ('TOPPADDING', (0, 0), (-1, -1), 4),
        ]))
        
        story.append(patient_table)
        story.append(Spacer(1, 15))
        
        return story
    
    def _create_report_section(self, report: EEGReport) -> list:
        """Create the report information section"""
        story = []
        
        story.append(Paragraph("REPORT DETAILS", self.styles['SectionHeader']))
        
        # Report details
        report_date = report.report_date.strftime("%B %d, %Y") if report.report_date else 'N/A'
        
        report_data = [
            ['Report Date:', report_date],
            ['Referring Physician:', report.ref_physician or 'N/A'],
        ]
        
        report_table = Table(report_data, colWidths=[1.8*inch, 4*inch])
        report_table.setStyle(TableStyle([
            ('ALIGN', (0, 0), (0, -1), 'LEFT'),
            ('ALIGN', (1, 0), (1, -1), 'LEFT'),
            ('FONTNAME', (0, 0), (0, -1), 'Helvetica-Bold'),
            ('FONTSIZE', (0, 0), (-1, -1), 11),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 4),
            ('TOPPADDING', (0, 0), (-1, -1), 4),
        ]))
        
        story.append(report_table)
        story.append(Spacer(1, 15))
        
        return story
    
    def _create_clinical_section(self, report: EEGReport) -> list:
        """Create the clinical findings section"""
        story = []
        
        story.append(Paragraph("CLINICAL FINDINGS", self.styles['SectionHeader']))
        
        # Indications
        if report.indications:
            story.append(Paragraph("Indications:", self.styles['SubsectionHeader']))
            story.append(Paragraph(report.indications, self.styles['ReportText']))
            story.append(Spacer(1, 10))
        
        # Technique
        if report.technique:
            story.append(Paragraph("Technique:", self.styles['SubsectionHeader']))
            story.append(Paragraph(report.technique, self.styles['ReportText']))
            story.append(Spacer(1, 10))
        
        # Factual Report
        if report.factual_report:
            story.append(Paragraph("Factual Report:", self.styles['SubsectionHeader']))
            story.append(Paragraph(report.factual_report, self.styles['ReportText']))
            story.append(Spacer(1, 10))
        
        # Impression
        story.append(Paragraph("Impression:", self.styles['SubsectionHeader']))
        impression_color = HexColor('#27ae60') if report.impression == 'normal' else HexColor('#e74c3c')
        impression_style = ParagraphStyle(
            'Impression',
            parent=self.styles['ReportText'],
            textColor=impression_color,
            fontName='Helvetica-Bold',
            fontSize=12
        )
        story.append(Paragraph(f"<b>{report.impression.upper()}</b>", impression_style))
        story.append(Spacer(1, 15))
        
        return story
    
    def _create_doctor_section(self, report: EEGReport, doctor: AuthUser) -> list:
        """Create the doctor information section"""
        story = []
        
        story.append(Paragraph("DOCTOR INFORMATION", self.styles['SectionHeader']))
        
        # Doctor details
        doctor_name = f"{doctor.first_name or ''} {doctor.last_name or ''}".strip() or doctor.username
        doctor_title = doctor.title or ''
        doctor_specialization = doctor.specialization or ''
        doctor_affiliation = doctor.hospital_affiliation or ''
        
        doctor_data = [
            ['Name:', doctor_name],
            ['Title:', doctor_title],
            ['Specialization:', doctor_specialization],
            ['Affiliation:', doctor_affiliation],
        ]
        
        doctor_table = Table(doctor_data, colWidths=[1.5*inch, 4*inch])
        doctor_table.setStyle(TableStyle([
            ('ALIGN', (0, 0), (0, -1), 'LEFT'),
            ('ALIGN', (1, 0), (1, -1), 'LEFT'),
            ('FONTNAME', (0, 0), (0, -1), 'Helvetica-Bold'),
            ('FONTSIZE', (0, 0), (-1, -1), 11),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 4),
            ('TOPPADDING', (0, 0), (-1, -1), 4),
        ]))
        
        story.append(doctor_table)
        
        # Additional doctor info from report
        if report.doctor_info:
            story.append(Spacer(1, 10))
            story.append(Paragraph("Additional Information:", self.styles['SubsectionHeader']))
            story.append(Paragraph(report.doctor_info, self.styles['ReportText']))
        
        story.append(Spacer(1, 20))
        
        return story
    
    def _create_footer(self, report: EEGReport) -> list:
        """Create the report footer"""
        story = []
        
        # Add a line
        story.append(HRFlowable(width="100%", thickness=1, lineCap='round', color=HexColor('#bdc3c7')))
        story.append(Spacer(1, 10))
        
        # Footer text
        footer_text = f"This report was generated on {datetime.now().strftime('%B %d, %Y at %I:%M %p')} by CereSignal EEG Analysis System."
        story.append(Paragraph(footer_text, self.styles['FieldLabel']))
        
        return story
    
    def _add_page_number(self, canvas, doc):
        """Add page numbers to the PDF"""
        canvas.saveState()
        canvas.setFont('Helvetica', 9)
        page_num = canvas.getPageNumber()
        text = f"Page {page_num}"
        canvas.drawRightString(200*mm, 20*mm, text)
        canvas.restoreState()


# Global instance
pdf_generator = PDFReportGenerator()