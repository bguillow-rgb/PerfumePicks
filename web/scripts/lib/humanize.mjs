// Post-generation humanizer pass. Runs the freshly generated article through a
// second Claude call that strips AI tells (per the personalizer playbook, itself
// based on Wikipedia's "Signs of AI writing") and puts a human voice back in,
// WITHOUT inventing facts or changing the article's structure, headings, tables,
// links, or schema-bearing fields.
//
// Fail-safe by design: any error (API, parse, guard) logs a warning and returns
// the ORIGINAL article unchanged, so the daily run never breaks because of this
// pass. It only ever improves the prose or leaves it as-is.
import { parseJsonBlock } from './generate.mjs';

const HUMANIZE_SYSTEM = `You are a ruthless copy editor. Your only job is to strip AI tells out of an already-written article and put a human voice back in. You are based on Wikipedia's "Signs of AI writing" (WikiProject AI Cleanup).

REMOVE these patterns:
- Inflated significance: stands/serves as, testament, pivotal, underscores, highlights its importance, reflects broader, plays a key/crucial/vital role, setting the stage, evolving landscape.
- AI vocabulary: additionally, moreover, furthermore, crucial, vital, essential, navigate the complexities, in today's fast-paced world, delve, tapestry, robust, leverage, holistic, ecosystem, paradigm, seamless, unlock.
- Marketing puffery: vibrant, rich, breathtaking, renowned, nestled, intuitive, powerful.
- Copula avoidance: "X serves as Y" becomes "X is Y".
- Negative parallelism: "It's not just X, but also Y" becomes a direct statement.
- Rule-of-three overuse: when everything is a triplet, break the pattern (use one, two, or four items).
- Fake-depth participles: trailing "...ensuring X", "...highlighting Y", "...fostering Z" that add nothing.
- Vague attributions / weasel words: "experts argue", "some critics", "studies show" with no named source.
- Filler/hedging: "in order to" becomes "to", "has the ability to" becomes "can", "might potentially" becomes "may".
- Chatbot artifacts, sycophancy, knowledge-cutoff hedges.
- Inline-header lists ("Speed: faster. Security: better.") become prose.
- Boldface spam, title-case headings, emojis, curly quotes.

ADD a human voice: vary sentence rhythm (mix short punchy sentences with longer ones), allow a clear point of view and the occasional aside, and use the editorial first person ("we", "in our experience") where the article already uses it.

HARD CONSTRAINTS (never break these; schema and SEO depend on them):
- NEVER use em dashes or en dashes or their HTML/unicode forms. Use commas, colons, parentheses, or separate sentences. Use a plain hyphen only for numeric ranges ("12-24 months", "15%-20%").
- Do NOT invent facts, numbers, dates, sources, names, quotes, or testimonials. Keep every factual claim exactly as given. If something is vague, leave it vague; never fabricate specifics.
- Preserve STRUCTURE exactly: keep every H2 heading and its question framing, keep all markdown tables, keep all internal and external links with their anchor text, keep any italic lead-ins like "*A question we hear often:*".
- Keep roughly the same length. Do not summarize, merge, or drop sections.
- Straight quotes only.`;

const USER_INSTRUCTION = `Humanize the prose in the following article fields. Return ONLY a single fenced json code block (tagged json) with exactly these keys and nothing else: quickAnswer (string), bodyMarkdown (string), faqs (array of {q, a} objects). Do not add, remove, reorder, merge, or drop any sections. Do not change heading text other than converting Title Case headings to sentence case. Keep all tables, links, and anchor text. Here is the article JSON:`;

// Belt-and-suspenders: even though the prompt forbids them, scrub any em/en dash
// (raw or HTML/unicode) that slips through, since a single dash is the loudest AI
// tell and FAQ/quickAnswer text feeds schema verbatim.
function scrubDashes(s) {
  if (typeof s !== 'string') return s;
  return s
    .replace(/&mdash;|&ndash;|&#8212;|&#8211;/g, ', ')
    .replace(/\s*[\u2014\u2013]\s*/g, ', ');
}

export async function humanizeArticle({ apiKey, model = 'claude-sonnet-4-6', article }) {
  try {
    const payload = {
      quickAnswer: article.quickAnswer,
      bodyMarkdown: article.bodyMarkdown,
      faqs: article.faqs,
    };
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model,
        max_tokens: 16000,
        system: HUMANIZE_SYSTEM,
        messages: [
          {
            role: 'user',
            content: `${USER_INSTRUCTION}\n\n\`\`\`json\n${JSON.stringify(payload)}\n\`\`\``,
          },
        ],
      }),
    });
    if (!res.ok) throw new Error(`Anthropic API ${res.status}: ${await res.text()}`);
    const data = await res.json();
    const text = (data.content || [])
      .filter((b) => b.type === 'text')
      .map((b) => b.text)
      .join('\n');
    const cleaned = parseJsonBlock(text);

    // Guard against a collapsed/truncated rewrite: if the body shrank by more
    // than ~35% the pass probably dropped sections, so keep the original.
    if (
      !cleaned ||
      typeof cleaned.bodyMarkdown !== 'string' ||
      cleaned.bodyMarkdown.length < article.bodyMarkdown.length * 0.65
    ) {
      throw new Error('humanized body missing or too short; keeping original');
    }

    const quickAnswer =
      typeof cleaned.quickAnswer === 'string' && cleaned.quickAnswer.trim().length >= 40
        ? scrubDashes(cleaned.quickAnswer)
        : article.quickAnswer;

    const faqs =
      Array.isArray(cleaned.faqs) && cleaned.faqs.length
        ? cleaned.faqs.map((f) => ({ q: scrubDashes(f.q), a: scrubDashes(f.a) }))
        : article.faqs;

    return {
      ...article,
      quickAnswer,
      bodyMarkdown: scrubDashes(cleaned.bodyMarkdown),
      faqs,
    };
  } catch (e) {
    console.error(`humanizeArticle: skipped (${e.message})`);
    return article;
  }
}
