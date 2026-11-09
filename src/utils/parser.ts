export interface Chapter {
    title: string;
    content: string;
}

export function sanitizeNovelText(raw: string): string {
    return raw
        .replace(/\r\n/g, '\n')
        .split('\n')
        .map(line => line.trim())
        .join('\n')
        .replace(/\n{3,}/g, '\n\n');
}

export function parseChapters(rawText: string): Chapter[] {
    const cleanText = sanitizeNovelText(rawText);
    const chapterRegex = /^[ \t]*(第[0-9零一二三四五六七八九十百千万两]+[章回节卷集]|序章|楔子|前言|后记|Chapter\s*\d+)[ \t]*(.*)$/gm;
    
    const chapters: Chapter[] = [];
    const matches = [...cleanText.matchAll(chapterRegex)];

    if (matches.length === 0) {
        return [{ title: '全文', content: cleanText }];
    }

    const firstMatchIndex = matches[0].index!;
    if (firstMatchIndex > 0) {
        chapters.push({
            title: '前言',
            content: cleanText.substring(0, firstMatchIndex).trim()
        });
    }

    for (let i = 0; i < matches.length; i++) {
        const currentMatch = matches[i];
        const nextMatch = matches[i + 1];
        
        const startIndex = currentMatch.index!;
        const endIndex = nextMatch ? nextMatch.index! : cleanText.length;
        
        const title = currentMatch[0].trim();
        const content = cleanText.substring(startIndex + currentMatch[0].length, endIndex).trim();
        
        chapters.push({ title, content });
    }

    return chapters;
}