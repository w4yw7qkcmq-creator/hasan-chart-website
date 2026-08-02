function logInstantAnalysisV2(tag, payload = {}) {
  const line = `${tag} ${JSON.stringify({
    ...payload,
    ts: new Date().toISOString(),
  })}`;

  const isError =
    tag.includes("FAILED") ||
    tag.includes("INVALID") ||
    payload?.success === false;

  if (isError) {
    console.error(line);
  } else {
    console.log(line);
  }
}

module.exports = { logInstantAnalysisV2 };
