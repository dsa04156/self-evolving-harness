export default async function* summaryTestReporter(source) {
  for await (const event of source) {
    if (event.type === "test:summary") {
      yield `${JSON.stringify({
        kind: "test-summary",
        ...event.data,
      })}\n`;
    } else if (event.type === "test:coverage") {
      const totals = event.data.summary?.totals;
      yield `${JSON.stringify({
        kind: "coverage-summary",
        totals: totals ?? null,
      })}\n`;
    }
  }
}
