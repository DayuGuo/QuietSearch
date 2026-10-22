function parseSearchInput(rawInput, maxQueryCodePoints) {
  if (!Number.isInteger(maxQueryCodePoints) || maxQueryCodePoints < 1) {
    throw new RangeError("Invalid query-length configuration");
  }
  if (typeof rawInput !== "string") {
    return { ok: false, code: "INVALID_INPUT" };
  }

  const submittedQuery = rawInput.trim();
  const wantsAnswer = /[?？]$/u.test(submittedQuery);
  const query = wantsAnswer
    ? submittedQuery.replace(/[?？]+$/u, "").trimEnd()
    : submittedQuery;

  if (!/[^\s?？]/u.test(query)) {
    return { ok: false, code: "EMPTY_QUERY" };
  }
  if (Array.from(query).length > maxQueryCodePoints) {
    return { ok: false, code: "QUERY_TOO_LONG" };
  }
  return {
    ok: true,
    submittedQuery,
    query,
    mode: wantsAnswer ? "answer" : "search",
  };
}

const assert = require('node:assert/strict');
const good = [
  ['肝纤维化 超声','search','肝纤维化 超声'],
  ['为什么天空是蓝色的','search','为什么天空是蓝色的'],
  ['问题?','answer','问题'],
  ['问题？','answer','问题'],
  [' 问题？   ','answer','问题'],
  ['问题?\n','answer','问题'],
  ['问题?\t','answer','问题'],
  ['问题？\u3000','answer','问题'],
  ['问题??','answer','问题'],
  ['问题？？','answer','问题'],
  ['问题?？','answer','问题'],
  ['问题 ?？','answer','问题'],
  ['甲？乙','search','甲？乙'],
  ['https://example.org/?q=test','search','https://example.org/?q=test'],
  ['问题？。','search','问题？。'],
  ['"问题？"','search','"问题？"'],
  ['问题? text','search','问题? text'],
  [' What is fibrosis? ','answer','What is fibrosis'],
  ['https://example.org/?','answer','https://example.org/'],
  ['甲？乙？','answer','甲？乙'],
  ['😀'.repeat(128)+'？','answer','😀'.repeat(128)],
  ['a'.repeat(128)+'?','answer','a'.repeat(128)],
];
for(const [input,mode,query] of good) {
  const result = parseSearchInput(input,128);
  assert.equal(result.ok,true,JSON.stringify(input));
  assert.equal(result.mode,mode,JSON.stringify(input));
  assert.equal(result.query,query,JSON.stringify(input));
  assert.equal(result.submittedQuery,input.trim());
}
const bad = [
  ['', 'EMPTY_QUERY'], ['   ','EMPTY_QUERY'], ['?','EMPTY_QUERY'],
  ['？？','EMPTY_QUERY'], ['? ？','EMPTY_QUERY'], ['?\n？','EMPTY_QUERY'],
  ['\t\u3000','EMPTY_QUERY'], [null,'INVALID_INPUT'], [123,'INVALID_INPUT'],
  ['a'.repeat(129)+'?','QUERY_TOO_LONG'], ['😀'.repeat(129)+'？','QUERY_TOO_LONG'],
];
for(const [input,code] of bad) {
  assert.deepEqual(parseSearchInput(input,128),{ok:false,code});
}
assert.throws(()=>parseSearchInput('query',0),RangeError);
console.log(`PASS: ${good.length + bad.length + 1} reference parser cases`);
