// Bob-voice pass. Runs after the humanize pass and rewrites every sentence
// that breaks Bob Guillow's voice rules (commentary, previews, contrastive
// negation, drumrolls, stock metaphors), keeping facts, headings, tables and
// links exactly. Same fail-safe as humanize.mjs: any error returns the input.
import { parseArticleResponse } from './generate.mjs';

const BOB_VOICE_SYSTEM = `You are rewriting a perfume article so it reads like Bob Guillow wrote it. Bob built Perfume Picks, a fragrance wardrobe app, and writes the site himself. His voice: plain facts, stated once, then the next fact. Easygoing, specific, never performed. This is a real rewrite: change every sentence that breaks a rule below. Leave sentences that already follow the rules alone.

FIX EVERY INSTANCE OF THESE (with the kind of fix Bob makes):
1. Commentary on a fact or on the article itself. Delete it or replace it with the fact.
   "Understanding it sharpens how you read bottles, build flights, and decide what belongs in your cellar." -> delete, or state the concrete use once.
   "Here is a collector-focused breakdown of what the law says..." -> delete; start with the first fact.
   "This is the part most people get wrong." / "That's the key." / "Let's break it down." -> delete.
   Any sentence that previews what the article or section will cover ("Here's what the law says, which states...", "Below are...", "We'll cover...") -> delete.
2. Contrastive negation and payoff lines. "X is not just the foundation. It's practically the entire story." -> "Corn makes up most of the mash bill." "Not because A, but because B" -> "because B". "No exceptions." tacked on for emphasis -> fold into the fact or delete.
3. Drumrolls and announce-then-state: "The short answer:", "Here's the thing:", "The reality is more complicated", "The answer is simple" -> just state it.
4. Opening throat-clearing. The first paragraph starts with the answer or the most useful fact, never "X is one of those terms that..." or "If you collect bourbon long enough...". Keep any internal link from that paragraph.
5. Stock metaphors and performed color: "flavor architecture", "third point of that triangle", "the holy grail", "rabbit hole", "game changer", "speaks volumes", "a symphony of" -> plain words.
6. Rule of three by reflex: lists of three adjectives or three clauses that pad a sentence -> keep the one or two that carry information.
7. Mood and emphasis words: actually, really, truly, genuinely, incredibly, simply, quite, literally, "it's worth noting", "importantly" -> delete.
8. Second-guessing the reader ("You might be wondering", "You've probably heard") and invented scenarios with made-up people -> delete or state the fact.
9. Overclaims: "nobody", "everyone", "always", "never", "the only" when not literally true -> make it accurate.
10. Em dashes and en dashes: never. A dash between two numbers is a range; write it with a hyphen (20-30%).

KEEP:
- Every fact, number, date, name, source, legal citation and price exactly. Do not add facts, examples, anecdotes or first-hand claims ("I tested", "in my collection").
- Every H2 heading's exact text, every markdown table, every link and its anchor text, and every italic lead-in line like "*A question we hear often:*".
- The section order. Length can shrink, but never drop a section, and keep the body at least 70% of its original length.
- Straight quotes. Plain markdown.

Bob's sentences are 12-24 words on average, mixing short and long. Write like someone explaining perfume to a friend at the counter: direct, specific, and unhurried.`;

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
  // A dash between two numbers is a range: keep it as a hyphen. Turning it into
  // a comma published "20, 30% ABV" for "20-30% ABV" (2026-11-22 doubler post).
  return s
    .replace(/(\d)\s*(?:&mdash;|&ndash;|&#8212;|&#8211;|[\u2014\u2013])\s*(\d)/g, '$1-$2')
    .replace(/&mdash;|&ndash;|&#8212;|&#8211;/g, ', ')
    .replace(/\s*[\u2014\u2013]\s*/g, ', ');
}

export async function bobVoiceArticle({ apiKey, model = 'claude-sonnet-4-6', article }) {
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
        system: BOB_VOICE_SYSTEM,
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
      cleaned.bodyMarkdown.length < article.bodyMarkdown.length * 0.6
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
      // The model keeps section-preview lines ("Here's what that means...").
      bodyMarkdown: scrubDashes(cleaned.bodyMarkdown)
        .replace(/(^|[.!?]\s+)(?:Here's what|Here is what|Below(?:,| are| is))[^.!?\n]*[.!?]/gm, '$1')
        .replace(/ +\n/g, '\n'),
      faqs,
    };
  } catch (e) {
    console.error(`bobVoiceArticle: skipped (${e.message})`);
    return article;
  }
}
