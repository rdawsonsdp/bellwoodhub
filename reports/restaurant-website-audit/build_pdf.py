import json, os
from reportlab.lib.pagesizes import letter, landscape
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import inch
from reportlab.lib import colors
from reportlab.platypus import (SimpleDocTemplate, Paragraph, Spacer, Table,
                                TableStyle, PageBreak)

SP = "/tmp/claude-0/-home-user-bellwoodhub/c81ee16d-be56-5745-928f-8e25e1544da1/scratchpad"
with open(os.path.join(SP, "merged.json")) as fh:
    data = json.load(fh)

rows = data["rows"]
NAVY = colors.HexColor("#1F3864")
STATUS_LABEL = {
    "NO_WEBSITE": "NO WEBSITE",
    "WEBSITE_UNAVAILABLE": "WEBSITE UNAVAILABLE",
    "SOCIAL_ONLY": "SOCIAL MEDIA ONLY",
}
STATUS_COLOR = {
    "NO_WEBSITE": colors.HexColor("#C0392B"),
    "WEBSITE_UNAVAILABLE": colors.HexColor("#B9770E"),
    "SOCIAL_ONLY": colors.HexColor("#2E5FA3"),
}
STATUS_DESC = {
    "NO_WEBSITE": "No website and no social page found — directory listings only.",
    "WEBSITE_UNAVAILABLE": "A website is listed or referenced online, but it is dead, parked, expired, broken, or hijacked.",
    "SOCIAL_ONLY": "No website of their own — only Facebook/Instagram and/or delivery-app pages.",
}

styles = getSampleStyleSheet()
title_st = ParagraphStyle("T", parent=styles["Title"], fontName="Helvetica-Bold",
                          fontSize=20, textColor=NAVY, spaceAfter=4)
sub_st = ParagraphStyle("S", parent=styles["Normal"], fontName="Helvetica",
                        fontSize=10, textColor=colors.HexColor("#555555"), spaceAfter=2)
h2 = ParagraphStyle("H2", parent=styles["Heading2"], fontName="Helvetica-Bold",
                    fontSize=13, textColor=NAVY, spaceBefore=14, spaceAfter=6)
cell = ParagraphStyle("C", parent=styles["Normal"], fontName="Helvetica", fontSize=8, leading=10)
cell_b = ParagraphStyle("CB", parent=cell, fontName="Helvetica-Bold")
note_st = ParagraphStyle("N", parent=cell, fontSize=7.5, textColor=colors.HexColor("#444444"))

doc = SimpleDocTemplate(
    os.path.join(SP, "restaurants-no-website-bellwood-25mi.pdf"),
    pagesize=landscape(letter),
    leftMargin=0.5 * inch, rightMargin=0.5 * inch,
    topMargin=0.5 * inch, bottomMargin=0.5 * inch,
    title="Restaurant Website Audit — 25-Mile Radius of Bellwood, IL",
)
story = []

story.append(Paragraph("Restaurant Website Audit", title_st))
story.append(Paragraph("Independent restaurants with a missing, broken, or social-media-only web presence — 25-mile radius of Bellwood, IL", sub_st))
story.append(Paragraph("Run date: July 22, 2026 · Method: per-restaurant web search for an official website; every candidate URL fetched and verified. National chains excluded. Best-effort sweep across 8 zones — not a complete census of the radius.", sub_st))
story.append(Spacer(1, 10))

summary = [
    ["Restaurants checked", str(data["checked"])],
    ["Had a working website", str(data["has_site"])],
    ["Flagged", str(len(rows))],
    ["   No website at all", str(sum(1 for r in rows if r["status"] == "NO_WEBSITE"))],
    ["   Website unavailable / broken", str(sum(1 for r in rows if r["status"] == "WEBSITE_UNAVAILABLE"))],
    ["   Social media / delivery apps only", str(sum(1 for r in rows if r["status"] == "SOCIAL_ONLY"))],
]
st = Table(summary, colWidths=[3.2 * inch, 0.9 * inch], hAlign="LEFT")
st.setStyle(TableStyle([
    ("FONTNAME", (0, 0), (-1, -1), "Helvetica"),
    ("FONTSIZE", (0, 0), (-1, -1), 10),
    ("FONTNAME", (0, 0), (-1, 2), "Helvetica-Bold"),
    ("TEXTCOLOR", (0, 2), (-1, 2), colors.HexColor("#C0392B")),
    ("LINEBELOW", (0, 0), (-1, -1), 0.4, colors.HexColor("#CCCCCC")),
    ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
]))
story.append(st)

order = ["NO_WEBSITE", "WEBSITE_UNAVAILABLE", "SOCIAL_ONLY"]
for status in order:
    group = [r for r in rows if r["status"] == status]
    if not group:
        continue
    story.append(Paragraph(f"{STATUS_LABEL[status]} — {len(group)} restaurants", h2))
    story.append(Paragraph(STATUS_DESC[status], sub_st))
    story.append(Spacer(1, 4))

    table_data = [[Paragraph(h, ParagraphStyle("H", parent=cell_b, textColor=colors.white))
                   for h in ["Restaurant", "Address", "Town / Neighborhood", "Phone", "Cuisine", "URL Found", "Evidence"]]]
    for r in sorted(group, key=lambda x: (x["town"], x["name"])):
        table_data.append([
            Paragraph(r["name"], cell_b),
            Paragraph(r["address"], cell),
            Paragraph(r["town"], cell),
            Paragraph(r["phone"] or "—", cell),
            Paragraph(r["cuisine"], cell),
            Paragraph(r["url"] or "—", note_st),
            Paragraph(r["notes"], note_st),
        ])
    t = Table(table_data,
              colWidths=[1.45 * inch, 1.55 * inch, 1.15 * inch, 0.95 * inch, 1.35 * inch, 1.55 * inch, 2.0 * inch],
              repeatRows=1)
    t.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), STATUS_COLOR[status]),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("GRID", (0, 0), (-1, -1), 0.4, colors.HexColor("#BBBBBB")),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#F5F7FA")]),
        ("TOPPADDING", (0, 0), (-1, -1), 3),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
    ]))
    story.append(t)

story.append(Spacer(1, 14))
story.append(Paragraph("Coverage by zone", h2))
zt_data = [[Paragraph(h, ParagraphStyle("H", parent=cell_b, textColor=colors.white))
            for h in ["Zone", "Checked", "Flagged"]]]
for z in data["zones"]:
    zt_data.append([Paragraph(z["zone"], cell), Paragraph(str(z["checked"]), cell), Paragraph(str(z["flagged"]), cell)])
zt = Table(zt_data, colWidths=[6.5 * inch, 0.9 * inch, 0.9 * inch], hAlign="LEFT")
zt.setStyle(TableStyle([
    ("BACKGROUND", (0, 0), (-1, 0), NAVY),
    ("GRID", (0, 0), (-1, -1), 0.4, colors.HexColor("#BBBBBB")),
    ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#F5F7FA")]),
    ("VALIGN", (0, 0), (-1, -1), "TOP"),
]))
story.append(zt)

def footer(canvas, doc_):
    canvas.saveState()
    canvas.setFont("Helvetica", 7)
    canvas.setFillColor(colors.HexColor("#888888"))
    canvas.drawString(0.5 * inch, 0.3 * inch,
                      "Restaurant Website Audit — 25-mi radius of Bellwood, IL — July 22, 2026")
    canvas.drawRightString(10.5 * inch, 0.3 * inch, f"Page {doc_.page}")
    canvas.restoreState()

doc.build(story, onFirstPage=footer, onLaterPages=footer)
print("saved PDF")
