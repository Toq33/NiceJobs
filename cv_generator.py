"""
NiceJobs — Professional CV / Resume Generator
Generates modern, luxury hospitality-tailored PDF CVs using ReportLab.
"""

import io
import re
from datetime import datetime
from typing import Dict, Any, List

from reportlab.lib.pagesizes import letter
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, HRFlowable, KeepTogether
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib import colors
from reportlab.pdfgen import canvas


class NumberedCanvas(canvas.Canvas):
    """
    Two-pass canvas to dynamically compute and print accurate total page count on all pages.
    """
    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self._saved_page_states = []

    def showPage(self):
        self._saved_page_states.append(dict(self.__dict__))
        self._startPage()

    def save(self):
        num_pages = len(self._saved_page_states)
        for state in self._saved_page_states:
            self.__dict__.update(state)
            self.draw_footer(num_pages)
            canvas.Canvas.showPage(self)
        canvas.Canvas.save(self)

    def draw_footer(self, page_count):
        self.saveState()
        self.setFont("Helvetica", 8)
        self.setFillColor(colors.HexColor("#64748b"))
        
        # Subtle horizontal divider
        self.setStrokeColor(colors.HexColor("#cbd5e1"))
        self.setLineWidth(0.6)
        self.line(36, 28, letter[0] - 36, 28)

        # Footer branding & page numbering
        self.drawString(36, 16, "NiceJobs Hospitality Network • Verified Candidate Professional Resume")
        page_str = f"Page {self._pageNumber} of {page_count}"
        self.drawRightString(letter[0] - 36, 16, page_str)
        self.restoreState()


def escape_xml(text: Any) -> str:
    """Escapes XML entities for ReportLab Paragraphs."""
    if not text:
        return ""
    text_str = str(text)
    return (
        text_str.replace("&", "&amp;")
        .replace("<", "&lt;")
        .replace(">", "&gt;")
        .replace('"', "&quot;")
        .replace("'", "&#39;")
    )


def generate_candidate_cv_pdf(candidate_data: Dict[str, Any]) -> bytes:
    """
    Generates a high-quality, modern hospitality CV in PDF format from candidate data.
    Returns the binary PDF bytes.
    """
    buf = io.BytesIO()
    doc = SimpleDocTemplate(
        buf,
        pagesize=letter,
        leftMargin=36,
        rightMargin=36,
        topMargin=36,
        bottomMargin=42
    )

    styles = getSampleStyleSheet()

    # Custom Luxury & Modern Hospitality Typography Palette
    c_primary = colors.HexColor("#0a1128")    # Deep Midnight Navy
    c_accent = colors.HexColor("#ff6b00")     # NiceJobs Signature Orange
    c_dark = colors.HexColor("#1e293b")       # Dark Slate for titles
    c_body = colors.HexColor("#334155")       # Charcoal for body text
    c_muted = colors.HexColor("#64748b")      # Slate for dates & meta
    c_border = colors.HexColor("#e2e8f0")     # Light gray divider
    c_chip_bg = colors.HexColor("#f8fafc")    # Off-white chip background

    name_style = ParagraphStyle(
        "CvName",
        parent=styles["Normal"],
        fontName="Helvetica-Bold",
        fontSize=20,
        leading=24,
        textColor=c_primary,
        spaceAfter=3
    )

    title_style = ParagraphStyle(
        "CvTitle",
        parent=styles["Normal"],
        fontName="Helvetica-Bold",
        fontSize=11,
        leading=15,
        textColor=c_accent,
        spaceAfter=5
    )

    contact_style = ParagraphStyle(
        "CvContact",
        parent=styles["Normal"],
        fontName="Helvetica",
        fontSize=8.5,
        leading=12,
        textColor=c_muted
    )

    sec_hdr_style = ParagraphStyle(
        "CvSecHdr",
        parent=styles["Normal"],
        fontName="Helvetica-Bold",
        fontSize=10.5,
        leading=13,
        textColor=c_primary,
        spaceBefore=10,
        spaceAfter=2
    )

    body_style = ParagraphStyle(
        "CvBody",
        parent=styles["Normal"],
        fontName="Helvetica",
        fontSize=8.8,
        leading=13,
        textColor=c_body
    )

    item_title_style = ParagraphStyle(
        "CvItemTitle",
        parent=styles["Normal"],
        fontName="Helvetica-Bold",
        fontSize=9.5,
        leading=13,
        textColor=c_dark
    )

    item_subtitle_style = ParagraphStyle(
        "CvItemSubtitle",
        parent=styles["Normal"],
        fontName="Helvetica-Bold",
        fontSize=8.5,
        leading=12,
        textColor=c_accent
    )

    item_meta_style = ParagraphStyle(
        "CvItemMeta",
        parent=styles["Normal"],
        fontName="Helvetica",
        fontSize=8.2,
        leading=11,
        textColor=c_muted,
        alignment=2 # Right aligned
    )

    bullet_style = ParagraphStyle(
        "CvBullet",
        parent=styles["Normal"],
        fontName="Helvetica",
        fontSize=8.5,
        leading=12,
        textColor=c_body,
        leftIndent=12,
        spaceBefore=2
    )

    story = []

    # -------------------------------------------------------------
    # 1. Header Information
    # -------------------------------------------------------------
    raw_name = (
        candidate_data.get("name")
        or " ".join(filter(None, [
            candidate_data.get("first_name", ""),
            candidate_data.get("middle_name", ""),
            candidate_data.get("last_name", "")
        ]))
        or "Hospitality Professional"
    ).strip()

    cur_title = (candidate_data.get("current_job_title") or "").strip()
    cur_dept = (candidate_data.get("current_department") or candidate_data.get("current_job_designation") or "").strip()
    headline = (candidate_data.get("headline") or "").strip()
    
    if cur_title and cur_dept:
        display_sub = f"{cur_title} • {cur_dept}"
    elif cur_title or cur_dept:
        display_sub = cur_title or cur_dept
    elif headline:
        display_sub = headline
    else:
        desired_role = candidate_data.get("designation") or candidate_data.get("preferences", {}).get("desired_role") or "Hospitality Candidate"
        dept = candidate_data.get("department") or candidate_data.get("preferences", {}).get("department") or ""
        display_sub = f"{desired_role} • {dept}" if dept else desired_role

    email = (candidate_data.get("email") or "").strip()
    phone = (candidate_data.get("phone") or "").strip()
    phone_sec = (candidate_data.get("phone_secondary") or "").strip()
    location = (candidate_data.get("location") or candidate_data.get("preferences", {}).get("preferred_location") or "Bangladesh").strip()
    dob = (candidate_data.get("dob") or "").strip()

    story.append(Paragraph(escape_xml(raw_name.upper()), name_style))
    story.append(Paragraph(escape_xml(display_sub), title_style))

    # Contact line
    contact_parts = []
    if email:
        contact_parts.append(f"<b>Email:</b> {escape_xml(email)}")
    if phone:
        contact_parts.append(f"<b>Phone:</b> {escape_xml(phone)}")
    if phone_sec:
        contact_parts.append(f"<b>Alt:</b> {escape_xml(phone_sec)}")
    if location:
        contact_parts.append(f"<b>Location:</b> {escape_xml(location)}")
    if dob:
        contact_parts.append(f"<b>DOB:</b> {escape_xml(dob)}")

    contact_str = " &nbsp;&nbsp;|&nbsp;&nbsp; ".join(contact_parts)
    story.append(Paragraph(contact_str, contact_style))
    story.append(Spacer(1, 6))
    story.append(HRFlowable(width="100%", thickness=1.5, color=c_accent, spaceBefore=2, spaceAfter=8))

    # Helper function for section headings
    def add_section_header(title: str):
        story.append(Paragraph(escape_xml(title.upper()), sec_hdr_style))
        story.append(HRFlowable(width="100%", thickness=0.8, color=c_border, spaceBefore=2, spaceAfter=6))

    # -------------------------------------------------------------
    # 2. Professional Summary / Career Bio
    # -------------------------------------------------------------
    summary = (candidate_data.get("summary") or candidate_data.get("bio") or "").strip()
    if not summary and headline:
        summary = f"Dedicated hospitality professional specializing in {display_sub}. Committed to international five-star guest satisfaction standards and operational excellence."
    
    if summary:
        add_section_header("Professional Summary")
        story.append(Paragraph(escape_xml(summary), body_style))
        story.append(Spacer(1, 8))

    # -------------------------------------------------------------
    # 3. Career & Job Preferences (Target Role)
    # -------------------------------------------------------------
    prefs = candidate_data.get("preferences") or candidate_data.get("job_preferences") or {}
    pref_dept = prefs.get("department") or candidate_data.get("department")
    pref_role = prefs.get("desired_role") or candidate_data.get("designation")
    pref_shift = prefs.get("shift")
    pref_sal = prefs.get("expected_salary")
    pref_loc = prefs.get("preferred_location") or location

    pref_items = []
    if pref_role:
        pref_items.append(f"<b>Target Role:</b> {escape_xml(pref_role)}")
    if pref_dept:
        pref_items.append(f"<b>Preferred Department:</b> {escape_xml(pref_dept)}")
    if pref_shift:
        pref_items.append(f"<b>Shift:</b> {escape_xml(pref_shift)}")
    if pref_sal and pref_sal != "Negotiable":
        pref_items.append(f"<b>Expected Salary:</b> {escape_xml(pref_sal)}")
    if pref_loc:
        pref_items.append(f"<b>Work Location:</b> {escape_xml(pref_loc)}")

    if pref_items:
        add_section_header("Career &amp; Position Preferences")
        pref_str = " &nbsp;&nbsp;•&nbsp;&nbsp; ".join(pref_items)
        story.append(Paragraph(pref_str, body_style))
        story.append(Spacer(1, 8))

    # -------------------------------------------------------------
    # 4. Professional Work Experience
    # -------------------------------------------------------------
    experiences = candidate_data.get("experience") or []
    if isinstance(experiences, list) and len(experiences) > 0:
        add_section_header("Work Experience")
        
        for exp in experiences:
            if not isinstance(exp, dict):
                continue
            role = (exp.get("role") or "").strip()
            company = (exp.get("company") or "").strip()
            dept = (exp.get("department") or "").strip()
            date_from = (exp.get("date_from") or "").strip()
            date_to = (exp.get("date_to") or ("Present" if exp.get("is_current") else "")).strip()
            period = (exp.get("period") or "").strip()
            worked_yrs = (exp.get("worked_years") or "").strip()
            is_hosp = exp.get("is_hospitality", True)
            skills_acq = (exp.get("skills_acquired") or "").strip()

            date_display = ""
            if date_from and date_to:
                date_display = f"{date_from} – {date_to}"
            elif date_from:
                date_display = f"From {date_from}"
            elif date_to:
                date_display = date_to

            if worked_yrs and worked_yrs != "0":
                date_display = f"{date_display} ({worked_yrs} yrs)" if date_display else f"{worked_yrs} yrs"

            exp_block = []

            # 2-column header row: Role & Company on left, Dates on right
            left_text = f"<b>{escape_xml(role or 'Hospitality Associate')}</b>"
            if company:
                left_text += f" &nbsp;•&nbsp; <font color='#1e293b'><b>{escape_xml(company)}</b></font>"
            if dept:
                left_text += f" <font color='#64748b'>({escape_xml(dept)})</font>"

            tbl_data = [
                [Paragraph(left_text, item_title_style), Paragraph(escape_xml(date_display), item_meta_style)]
            ]
            t = Table(tbl_data, colWidths=[380, 160])
            t.setStyle(TableStyle([
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
                ("LEFTPADDING", (0, 0), (-1, -1), 0),
                ("RIGHTPADDING", (0, 0), (-1, -1), 0),
                ("TOPPADDING", (0, 0), (-1, -1), 0),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 2),
            ]))
            exp_block.append(t)

            # Details & responsibilities
            if is_hosp:
                exp_block.append(Paragraph("<font color='#ff6b00'>★</font> Verified Hospitality Property Experience", ParagraphStyle(
                    "HospBadge", parent=bullet_style, fontSize=7.8, leading=10, textColor=c_muted, spaceBefore=0
                )))

            if skills_acq:
                # If skills_acquired contains comma or newlines, render as bullet points
                lines = [s.strip() for s in re.split(r'[,;\n•]', skills_acq) if s.strip()]
                if len(lines) > 1:
                    for line in lines[:4]: # Cap at 4 key points per job for concise elegance
                        exp_block.append(Paragraph(f"• {escape_xml(line)}", bullet_style))
                else:
                    exp_block.append(Paragraph(f"• {escape_xml(skills_acq)}", bullet_style))
            else:
                exp_block.append(Paragraph(f"• Responsible for day-to-day guest service excellence and operational standards in {escape_xml(dept or 'department')}.", bullet_style))

            exp_block.append(Spacer(1, 6))
            story.append(KeepTogether(exp_block))

    # -------------------------------------------------------------
    # 5. Education & Academic Background
    # -------------------------------------------------------------
    education = candidate_data.get("education") or []
    if isinstance(education, list) and len(education) > 0:
        add_section_header("Education &amp; Qualifications")
        
        for edu in education:
            if not isinstance(edu, dict):
                continue
            deg = (edu.get("degree") or edu.get("degree_select") or "").strip()
            inst = (edu.get("institution") or "").strip()
            country = (edu.get("country") or "").strip()
            year = (edu.get("year") or "").strip()
            gpa = (edu.get("gpa") or edu.get("gpa_obtained") or "").strip()
            scale = (edu.get("gpa_scale") or "4.00").strip()

            edu_block = []
            left_text = f"<b>{escape_xml(deg or 'Academic Degree')}</b>"
            if inst:
                left_text += f" &nbsp;•&nbsp; {escape_xml(inst)}"
            if country and country != "Bangladesh":
                left_text += f" ({escape_xml(country)})"

            right_text = escape_xml(year)
            if gpa:
                right_text = f"Result: {escape_xml(gpa)}" + (f" (Scale {escape_xml(scale)})" if scale and "/" not in gpa else "")

            tbl_data = [
                [Paragraph(left_text, item_title_style), Paragraph(right_text, item_meta_style)]
            ]
            t = Table(tbl_data, colWidths=[400, 140])
            t.setStyle(TableStyle([
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
                ("LEFTPADDING", (0, 0), (-1, -1), 0),
                ("RIGHTPADDING", (0, 0), (-1, -1), 0),
                ("TOPPADDING", (0, 0), (-1, -1), 0),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
            ]))
            edu_block.append(t)
            edu_block.append(Spacer(1, 4))
            story.append(KeepTogether(edu_block))

    # -------------------------------------------------------------
    # 6. Certifications & Professional Licenses
    # -------------------------------------------------------------
    certifications = candidate_data.get("certifications") or []
    if isinstance(certifications, list) and len(certifications) > 0:
        add_section_header("Certifications &amp; Professional Training")
        
        for cert in certifications:
            if not isinstance(cert, dict):
                continue
            name = (cert.get("name") or cert.get("title") or "").strip()
            issuer = (cert.get("issuer") or cert.get("issued_by") or "").strip()
            yr = (cert.get("year") or "").strip()

            cert_block = []
            left_text = f"<b>{escape_xml(name)}</b>"
            if issuer:
                left_text += f" &nbsp;•&nbsp; <font color='#64748b'>{escape_xml(issuer)}</font>"

            tbl_data = [
                [Paragraph(left_text, item_title_style), Paragraph(escape_xml(yr), item_meta_style)]
            ]
            t = Table(tbl_data, colWidths=[420, 120])
            t.setStyle(TableStyle([
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
                ("LEFTPADDING", (0, 0), (-1, -1), 0),
                ("RIGHTPADDING", (0, 0), (-1, -1), 0),
                ("TOPPADDING", (0, 0), (-1, -1), 0),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
            ]))
            cert_block.append(t)
            cert_block.append(Spacer(1, 3))
            story.append(KeepTogether(cert_block))

    # -------------------------------------------------------------
    # 7. Core Competencies & Skills
    # -------------------------------------------------------------
    skills = candidate_data.get("skills") or []
    if isinstance(skills, list) and len(skills) > 0:
        add_section_header("Hospitality Core Competencies &amp; Skills")
        
        # Render skills as clean bulleted list or 2-column grid
        clean_skills = [escape_xml(s.strip()) for s in skills if isinstance(s, str) and s.strip()]
        if clean_skills:
            # Build 2-column table for skills
            half = (len(clean_skills) + 1) // 2
            col1 = clean_skills[:half]
            col2 = clean_skills[half:]
            
            skill_rows = []
            max_len = max(len(col1), len(col2))
            for i in range(max_len):
                c1 = f"• &nbsp;{col1[i]}" if i < len(col1) else ""
                c2 = f"• &nbsp;{col2[i]}" if i < len(col2) else ""
                skill_rows.append([
                    Paragraph(c1, body_style),
                    Paragraph(c2, body_style)
                ])

            t = Table(skill_rows, colWidths=[270, 270])
            t.setStyle(TableStyle([
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
                ("LEFTPADDING", (0, 0), (-1, -1), 0),
                ("RIGHTPADDING", (0, 0), (-1, -1), 0),
                ("TOPPADDING", (0, 0), (-1, -1), 1),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 2),
            ]))
            story.append(t)
            story.append(Spacer(1, 8))

    # -------------------------------------------------------------
    # 8. Languages
    # -------------------------------------------------------------
    languages = candidate_data.get("languages") or []
    if isinstance(languages, list) and len(languages) > 0:
        add_section_header("Languages")
        
        lang_parts = []
        for l in languages:
            if isinstance(l, dict):
                lname = (l.get("language") or l.get("name") or "").strip()
                lprof = (l.get("proficiency") or l.get("level") or "").strip()
                if lname:
                    lang_parts.append(f"<b>{escape_xml(lname)}</b> ({escape_xml(lprof or 'Conversational')})")
            elif isinstance(l, str) and l.strip():
                lang_parts.append(f"<b>{escape_xml(l.strip())}</b>")

        if lang_parts:
            story.append(Paragraph(" &nbsp;&nbsp;•&nbsp;&nbsp; ".join(lang_parts), body_style))
            story.append(Spacer(1, 8))

    # Build the PDF using NumberedCanvas
    doc.build(story, canvasmaker=NumberedCanvas)
    return buf.getvalue()
