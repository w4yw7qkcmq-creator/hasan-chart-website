import { SERVICES, SMOKE_STEP_SERVICE_MAP } from "../config.mjs";
import { stepNote, stepStatus } from "../artifact-reader.mjs";

export function buildDependencyGraph(qa) {
  const smoke = qa.smoke;
  const nodes = SERVICES.map((s) => {
    const relatedSteps = Object.entries(SMOKE_STEP_SERVICE_MAP)
      .filter(([, services]) => services.includes(s.id))
      .map(([stepId]) => stepId);
    const statuses = relatedSteps.map((id) => stepStatus(smoke, id));
    let health = "unknown";
    if (!qa.available) health = "awaiting-data";
    else if (statuses.some((st) => st === "FAIL")) health = "unhealthy";
    else if (statuses.some((st) => st === "BLOCKED" || st === "UNKNOWN")) health = "degraded";
    else if (statuses.some((st) => st === "PASS")) health = "healthy";
    else health = "not-tested";

    return { ...s, health, relatedSteps, statuses };
  });

  const edges = [];
  for (const node of nodes) {
    for (const dep of node.dependsOn) {
      edges.push({ from: node.id, to: dep });
    }
  }

  return {
    generatedAt: new Date().toISOString(),
    source: qa.available ? "qa-artifacts" : "static-topology",
    nodes,
    edges,
    mermaid: buildMermaid(nodes, edges),
  };
}

function buildMermaid(nodes, edges) {
  const lines = ["graph TD"];
  const healthStyle = { healthy: "🟢", degraded: "🟡", unhealthy: "🔴", unknown: "⚪", "awaiting-data": "⏳", "not-tested": "◯" };
  for (const n of nodes) {
    lines.push(`  ${n.id}["${healthStyle[n.health] || "◯"} ${n.name}"]`);
  }
  for (const e of edges) {
    lines.push(`  ${e.from} --> ${e.to}`);
  }
  return lines.join("\n");
}

export function serviceHealthSummary(graph) {
  const counts = { healthy: 0, degraded: 0, unhealthy: 0, unknown: 0 };
  for (const n of graph.nodes) {
    counts[n.health] = (counts[n.health] || 0) + 1;
  }
  return counts;
}
