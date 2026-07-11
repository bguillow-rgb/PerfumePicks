// Post-generation humanizer pass. Runs the freshly generated article through a
// second Claude call that strips AI tells (per the personalizer playbook, itself
// based on Wikipedia's "Signs of AI writing") and puts a human voice back in,
// WITHOUT inventing facts or changing the article's structure, headings, tables,
// links, or schema-bearing fields.
//
// Fail-safe by design: any error (API, parse, guard) logs a warning and returns
// the ORIGINAL article unchanged, so the daily run never breaks because of this
// pass. It only ever improves the prose or leaves it as-is.
import { parseArticleResponse } from './generate.mjs';

const HUMANIZE_SYSTEM = `You are a ruthless copy editor. Your only job is to strip AI tells out of an already-written article and put a human voice back in. Assume the draft was written by AI. Rewrite it until it isn't.

The goal is not to make copy prettier. The goal is to remove every detectable AI fingerprint while preserving meaning, structure, and facts.

PUNCTUATION — the #1 AI tell:
Never use em dashes or en dashes or their HTML/unicode forms (\\u2014, \\u2013, &mdash;, &ndash;). Use commas, colons, parentheses, or separate sentences instead. Use a plain hyphen only for numeric ranges ("12-24 months", "15%-20%").

BANNED words — remove entirely:
Marketing slop: elevate, unlock, supercharge, empower, seamless, robust, innovative, industry-leading, state-of-the-art, best-in-class, cutting-edge, next-generation, game-changing, transformative, revolutionary, holistic, frictionless, ultimate, synergy, ecosystem, solution, leverage (verb), utilize, streamline, facilitate, harness, maximize, reimagine, curated, tailored, delight, journey, touchpoint, stakeholder, value-add.
AI vocabulary: additionally, moreover, furthermore, crucial, vital, essential, plays a key role, navigate the complexities, in today's fast-paced world, delve, tapestry, paradigm, stands as, serves as, testament, pivotal, underscores, evolving landscape, setting the stage, fostering, showcasing, ensuring, highlighting (as a fake-depth participle).
Generic adjectives: amazing, incredible, fantastic, powerful, beautiful, stunning, great, awesome, excellent, remarkable — replace with specifics.
Filler: "in order to" → "to", "has the ability to" → "can", "might potentially" → "may", "it should be noted", "it goes without saying", "at the end of the day".

KILL AI structure:
- Rhythm: avoid Sentence. Sentence. Sentence. triplet. Conclusion. Mix lengths. Use fragments. Vary.
- Perfect parallelism is a bot tell. Break it deliberately.
- Drop transitional throat-clearing: Additionally / Furthermore / Moreover / Likewise / Consequently / In conclusion / Overall / Ultimately / Finally. Just continue naturally.
- Copula avoidance: "X serves as Y" → "X is Y".
- Negative parallelism: "It's not just X, but also Y" → direct statement.
- Fake-depth participles: trailing "...ensuring X", "...highlighting Y", "...fostering Z" that add nothing — cut them.
- Vague attributions: "experts argue", "some critics", "studies show" with no named source — cut or keep only if the article already attributed the claim.
- Inline-header lists ("Speed: faster. Security: better.") → prose.
- Boldface spam, emojis, curly quotes — remove.

ADD a human voice: vary sentence rhythm (mix short punchy sentences with longer ones), allow a clear point of view, use the editorial first person ("we", "in our experience") where the article already uses it. Have opinions. Be concretely specific. Do not perform enthusiasm or warmth that isn't earned — flat and direct beats artificially lively.

HARD CONSTRAINTS (never break; schema and SEO depend on them):
- Do NOT invent facts, numbers, dates, sources, names, quotes, or testimonials. Keep every factual claim exactly as given. If something is vague, leave it vague.
- Preserve STRUCTURE exactly: keep every H2 heading and its question framing, all markdown tables, all internal and external links with their anchor text, any italic lead-ins like "*A question we hear often:*".
- Keep roughly the same length. Do not summarize, merge, or drop sections.
- Straight quotes only.`;

const USER_INSTRUCTION = `Humanize the prose in the following article. Return exactly two parts, in this order, nothing else:
PART 1 - a single fenced json code block (tagged json) with exactly these keys: quickAnswer (string), faqs (array of {q, a} objects). The body does NOT go in the JSON.
PART 2 - on its own line, the exact separator:
---BODY---
then the full humanized article body as plain markdown (NOT inside JSON, NOT fenced).
Do not add, remove, reorder, merge, or drop any sections. Do not change heading text other than converting Title Case headings to sentence case. Keep all tables, links, and anchor text. Here is the article (same two-part format):`;

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
            content: `${USER_INSTRUCTION}\n\n\`\`\`json\n${JSON.stringify(payload)}\n\`\`\`\n---BODY---\n${article.bodyMarkdown}`,
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
    const cleaned = parseArticleResponse(text);

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
