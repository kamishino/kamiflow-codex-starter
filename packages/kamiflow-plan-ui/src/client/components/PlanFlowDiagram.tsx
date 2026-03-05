import { GitBranch } from "lucide-preact";
import { useEffect, useMemo, useRef, useState } from "preact/hooks";
import type { PlanDetail } from "../types";
import { buildImplementationFlowModel } from "../../lib/plan-diagram";
import { Card, CardContent, CardHeader, CardTitle } from "../ui/Card";
import { Icon } from "../ui/Icon";

interface ImplementationFlowPanelProps {
  detail: PlanDetail;
}

type MermaidRenderState = "idle" | "ready" | "error";

let mermaidLoader: Promise<any> | null = null;

async function loadMermaid() {
  if (!mermaidLoader) {
    mermaidLoader = import("https://cdn.jsdelivr.net/npm/mermaid@11/dist/mermaid.esm.min.mjs").then((mod: any) => {
      const mermaid = mod?.default ?? mod;
      mermaid.initialize({
        startOnLoad: false,
        securityLevel: "strict",
        theme: "neutral"
      });
      return mermaid;
    });
  }
  return await mermaidLoader;
}

export function ImplementationFlowPanel(props: ImplementationFlowPanelProps) {
  const model = useMemo(
    () =>
      buildImplementationFlowModel({
        summary: props.detail.summary,
        sections: props.detail.sections || {}
      }),
    [props.detail.summary.plan_id, props.detail.summary.updated_at, props.detail.sections]
  );
  const mermaidHostRef = useRef<HTMLDivElement>(null);
  const [renderState, setRenderState] = useState<MermaidRenderState>("idle");
  const [renderError, setRenderError] = useState("");

  useEffect(() => {
    let disposed = false;

    async function renderMermaid() {
      const host = mermaidHostRef.current;
      if (!host) {
        return;
      }
      setRenderState("idle");
      setRenderError("");
      host.removeAttribute("data-processed");
      host.textContent = model.mermaid;
      try {
        const mermaid = await loadMermaid();
        if (disposed) {
          return;
        }
        await mermaid.run({ nodes: [host], suppressErrors: true });
        if (disposed) {
          return;
        }
        setRenderState("ready");
      } catch (err) {
        if (disposed) {
          return;
        }
        setRenderState("error");
        setRenderError(err instanceof Error ? err.message : String(err));
      }
    }

    void renderMermaid();
    return () => {
      disposed = true;
    };
  }, [model.mermaid, props.detail.summary.plan_id, props.detail.summary.updated_at]);

  return (
    <Card class="implementation-flow-card">
      <CardHeader>
        <CardTitle>
          <Icon icon={GitBranch} />
          Implementation Flow
        </CardTitle>
        <p class="implementation-flow-note">
          Task-logic view for what we will do. Source of truth remains plan markdown.
        </p>
      </CardHeader>
      <CardContent>
        <div class="implementation-flow-meta">
          <span class={`implementation-flow-chip implementation-flow-chip-${model.source_type}`}>
            {model.source_type === "section" ? "From Implementation Flow section" : "Auto-derived from tasks"}
          </span>
          <span class="implementation-flow-chip">Tasks: {model.tasks.length}</span>
          <span class={`implementation-flow-chip implementation-flow-chip-${renderState}`}>
            Mermaid: {renderState === "ready" ? "Rendered" : renderState === "error" ? "Fallback" : "Loading"}
          </span>
        </div>

        <div class="implementation-flow-diagram-wrap">
          <div class="implementation-flow-mermaid mermaid" ref={mermaidHostRef} />
        </div>

        {renderState === "error" ? (
          <div class="implementation-flow-warning">
            Mermaid render failed: {renderError || "unknown error"}. Showing source below.
          </div>
        ) : null}

        {model.warnings.length ? (
          <ul class="implementation-flow-warning-list">
            {model.warnings.map((item) => (
              <li>{item}</li>
            ))}
          </ul>
        ) : null}

        <details class="implementation-flow-source">
          <summary>View Mermaid source</summary>
          <pre>{model.mermaid}</pre>
        </details>
      </CardContent>
    </Card>
  );
}

// Backward-compatible export name.
export const PlanFlowDiagram = ImplementationFlowPanel;
