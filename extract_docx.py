import zipfile
import re

docx_path = "FINAL-cloud-based-thesis-archive-system.docx"
txt_path = "extracted_thesis_text.txt"

try:
    with zipfile.ZipFile(docx_path) as z:
        doc_xml = z.read("word/document.xml").decode("utf-8")
        # Extract text within <w:t> tags
        text_runs = re.findall(r'<w:t[^>]*>(.*?)</w:t>', doc_xml)
        full_text = "\n".join(text_runs)
        
        with open(txt_path, "w", encoding="utf-8") as f:
            f.write(full_text)
    print("SUCCESS")
except Exception as e:
    print("ERROR:", e)
