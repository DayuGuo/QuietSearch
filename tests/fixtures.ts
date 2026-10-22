export const fixtureResults = [
  {
    title: 'A calmer way to explore the web',
    url: 'https://example.org/quiet-search',
    snippet:
      'A synthetic result used only in automated tests. Search with clear sources and fewer distractions.',
    summary:
      'This synthetic source describes a minimal search interface with explicit, on-demand AI summaries.',
    site_name: 'Example Journal',
    date: '2026-10-20T12:00:00Z',
  },
  {
    title: 'Small steps, useful discoveries',
    url: 'https://example.net/discovery',
    snippet:
      'Synthetic content for testing long titles, keyboard interaction, and source citations.',
    summary:
      'This synthetic source recommends small, focused queries and checking original sources.',
    site_name: 'Open Notes',
    date: null,
  },
];
export const sources = fixtureResults.map((item, index) => ({
  id: index + 1,
  title: item.title,
  url: item.url,
  summary: item.summary,
}));
export function upstreamStream(
  content = 'A concise answer based on source summaries. [1][2]',
  ending = true,
) {
  return `: heartbeat\n\ndata: ${JSON.stringify({ choices: [{ delta: { reasoning_content: 'not displayed', content }, finish_reason: null }] })}\n\ndata: ${JSON.stringify({ choices: [{ delta: {}, finish_reason: 'stop' }], usage: { prompt_tokens: 40, completion_tokens: 15 } })}\n\n${ending ? 'data: [DONE]\n\n' : ''}`;
}
export function chunked(text: string, size = 1) {
  const bytes = new TextEncoder().encode(text);
  return new ReadableStream<Uint8Array>({
    start(controller) {
      for (let index = 0; index < bytes.length; index += size)
        controller.enqueue(bytes.slice(index, index + size));
      controller.close();
    },
  });
}
