import { Document, Packer, Paragraph, TextRun, HeadingLevel, BorderStyle } from 'docx';

function parseMarkdownSections(content: string): { type: 'h1' | 'h2' | 'h3' | 'p' | 'code' | 'hr'; text: string }[] {
  const lines = content.split('\n');
  const sections: { type: 'h1' | 'h2' | 'h3' | 'p' | 'code' | 'hr'; text: string }[] = [];
  let codeBlock = false;
  let codeLines: string[] = [];

  for (const line of lines) {
    if (line.startsWith('```')) {
      if (codeBlock) {
        sections.push({ type: 'code', text: codeLines.join('\n') });
        codeLines = [];
        codeBlock = false;
      } else {
        codeBlock = true;
      }
      continue;
    }
    if (codeBlock) {
      codeLines.push(line);
      continue;
    }
    if (line.startsWith('### ')) {
      sections.push({ type: 'h3', text: line.slice(4).trim() });
    } else if (line.startsWith('## ')) {
      sections.push({ type: 'h2', text: line.slice(3).trim() });
    } else if (line.startsWith('# ')) {
      sections.push({ type: 'h1', text: line.slice(2).trim() });
    } else if (line === '---' || line === '***' || line === '___') {
      sections.push({ type: 'hr', text: '' });
    } else if (line.trim()) {
      const text = line
        .replace(/\*\*(.+?)\*\*/g, '$1')
        .replace(/__(.+?)__/g, '$1')
        .replace(/\*(.+?)\*/g, '$1')
        .replace(/_(.+?)_/g, '$1')
        .replace(/`(.+?)`/g, '$1')
        .replace(/\[(.+?)\]\(.+?\)/g, '$1')
        .replace(/!\[.*?\]\(.+?\)/g, '')
        .replace(/^>\s?/, '');
      sections.push({ type: 'p', text });
    }
  }

  return sections;
}

function cleanInlineFormatting(text: string): TextRun[] {
  const segments: TextRun[] = [];
  const regex = /(\*\*(.+?)\*\*)|(\*(.+?)\*)|(`(.+?)`)|(.+?)/g;
  let match;

  while ((match = regex.exec(text)) !== null) {
    if (match[1]) {
      segments.push(new TextRun({ text: match[2], bold: true }));
    } else if (match[3]) {
      segments.push(new TextRun({ text: match[4], italics: true }));
    } else if (match[5]) {
      segments.push(new TextRun({ text: match[6], font: 'Consolas', size: 20, color: '2B579A' }));
    } else if (match[7]) {
      segments.push(new TextRun({ text: match[7] }));
    }
  }

  if (segments.length === 0 && text) {
    segments.push(new TextRun({ text }));
  }

  return segments;
}

export async function exportToWord(content: string, fileName: string): Promise<void> {
  const sections = parseMarkdownSections(content);

  const children: Paragraph[] = [];

  for (const section of sections) {
    switch (section.type) {
      case 'h1':
        children.push(
          new Paragraph({
            children: [new TextRun({ text: section.text, bold: true, size: 32, color: '0D9488' })],
            heading: HeadingLevel.HEADING_1,
            spacing: { before: 400, after: 200 },
          })
        );
        break;
      case 'h2':
        children.push(
          new Paragraph({
            children: [new TextRun({ text: section.text, bold: true, size: 28, color: '0891B2' })],
            heading: HeadingLevel.HEADING_2,
            spacing: { before: 300, after: 150 },
          })
        );
        break;
      case 'h3':
        children.push(
          new Paragraph({
            children: [new TextRun({ text: section.text, bold: true, size: 24, color: '334155' })],
            heading: HeadingLevel.HEADING_3,
            spacing: { before: 200, after: 100 },
          })
        );
        break;
      case 'p':
        children.push(
          new Paragraph({
            children: cleanInlineFormatting(section.text),
            spacing: { after: 120 },
          })
        );
        break;
      case 'code':
        children.push(
          new Paragraph({
            children: [new TextRun({ text: section.text, font: 'Consolas', size: 18, color: '1E293B' })],
            shading: { fill: 'F1F5F9' },
            indent: { left: 360 },
            spacing: { before: 100, after: 100 },
            border: {
              left: { style: BorderStyle.SINGLE, size: 2, color: 'CBD5E1' },
            },
          })
        );
        break;
      case 'hr':
        children.push(
          new Paragraph({
            children: [],
            border: {
              bottom: { style: BorderStyle.SINGLE, size: 1, color: 'CBD5E1' },
            },
            spacing: { before: 200, after: 200 },
          })
        );
        break;
    }
  }

  const doc = new Document({
    sections: [
      {
        properties: {},
        children,
      },
    ],
  });

  const blob = await Packer.toBlob(doc);
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${fileName}.docx`;
  a.click();
  URL.revokeObjectURL(url);
}
