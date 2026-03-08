import { Badge, Button, Card, CardContent, CardDescription, CardHeader, CardTitle } from "@kamishino/kfc-web-ui";
import { TranscriptView } from "./TranscriptView";
import type { ChatSessionPayload, TranscriptBlock } from "../types";

interface ConversationPanelProps {
  projectName: string;
  projectDir: string;
  session: ChatSessionPayload | null;
  transcript: TranscriptBlock[];
  connected: boolean;
  statusLine: string;
  tokenValue: string;
  bindSessionId: string;
  promptValue: string;
  onTokenInput: (value: string) => void;
  onBindInput: (value: string) => void;
  onPromptInput: (value: string) => void;
  onConnect: () => void;
  onDisconnect: () => void;
  onBind: () => void;
  onCopySetup: () => void;
  onSendPrompt: () => void;
}

export function ConversationPanel(props: ConversationPanelProps) {
  const bound = props.session?.bound_session;
  const guidance = bound?.bound
    ? "Connect to the bound session and send the next prompt to start the chat timeline."
    : bound?.reason || "Connect first, then bind a Codex session to start the chat timeline.";
  const onboardingVisible = !bound?.bound;
  const canBind = Boolean(bound?.can_bind);
  const canPrompt = Boolean(bound?.bound && props.connected);
  const onboardingCommand = bound?.onboarding_command || "kfc client --force --no-launch-codex";
  const onboardingCopy = bound?.state === "client_session_missing"
    ? "This project has no KFC runtime file yet. Run the setup command first, then reconnect and bind a session."
    : "Paste a Codex session id to bind or rebind this project from the browser.";

  return (
    <section class="panel panel-transcript ui-card">
      <div class="topbar-row-main">
        <div class="topbar-left">
          <p class="topbar-eyebrow">KFC Chat</p>
          <h1>Bound Codex Session Chat</h1>
          <p class="status-copy">{props.statusLine}</p>
        </div>
        <div class="topbar-right">
          <Badge tone={props.connected ? "success" : "muted"}>{props.connected ? "connected" : "disconnected"}</Badge>
        </div>
      </div>
      <div class="hero-meta">
        <Badge tone="muted">Project</Badge>
        <code>{props.projectName}</code>
        <small>{props.projectDir}</small>
      </div>
      <section class="conversation-summary">
        <Card class="summary-card">
          <CardContent>
            <span class="summary-label">Session</span>
            <strong>{bound?.bound ? bound.session_id : "Unbound"}</strong>
            <small>{bound?.bound ? `Plan ${bound.plan_id}` : "Bind a Codex session to start the chat."}</small>
          </CardContent>
        </Card>
        <Card class="summary-card">
          <CardContent>
            <span class="summary-label">Connection</span>
            <strong>{props.connected ? "Connected" : "Disconnected"}</strong>
            <small>{`Queue: ${props.session?.queue_depth || 0}`}</small>
          </CardContent>
        </Card>
      </section>
      <Card class="auth-card">
        <CardContent class="stack-gap-sm">
          <label class="field">
            <span>Token</span>
            <input id="token-input" type="password" value={props.tokenValue} onInput={(event: any) => props.onTokenInput(event.currentTarget.value)} placeholder="Paste the chat token" autocomplete="off" />
          </label>
          <div class="auth-actions">
            <Button id="connect-button" type="button" onClick={props.onConnect}>Connect</Button>
            <Button id="disconnect-button" type="button" variant="outline" onClick={props.onDisconnect}>Disconnect</Button>
          </div>
        </CardContent>
      </Card>
      <Card id="onboarding-card" class="action-card onboarding-card" hidden={!onboardingVisible}>
        <CardHeader>
          <CardTitle id="onboarding-title">{bound?.onboarding_title || "Bind a Codex session"}</CardTitle>
          <CardDescription id="onboarding-copy">{onboardingCopy}</CardDescription>
        </CardHeader>
        <CardContent class="stack-gap-sm">
          <label id="bind-session-field" class="field" hidden={!canBind}>
            <span>Session ID</span>
            <input id="bind-session-input" type="text" value={props.bindSessionId} onInput={(event: any) => props.onBindInput(event.currentTarget.value)} placeholder="Paste a Codex session id" autocomplete="off" disabled={!canBind} />
          </label>
          <div class="quick-actions">
            <Button id="bind-session-button" type="button" onClick={props.onBind} disabled={!canBind || !props.connected}>Bind Session</Button>
            <Button id="copy-onboarding-command-button" type="button" variant="outline" onClick={props.onCopySetup}>Copy Setup Command</Button>
          </div>
          <pre id="onboarding-command" class="command-block">{onboardingCommand}</pre>
        </CardContent>
      </Card>
      <div id="transcript-list" class="transcript-list ui-scroll-area">
        <TranscriptView blocks={props.transcript} guidance={guidance} />
      </div>
      <Card class="composer">
        <CardContent class="stack-gap-sm">
          <label class="field">
            <span>Next Prompt</span>
            <textarea id="prompt-input" rows={5} value={props.promptValue} onInput={(event: any) => props.onPromptInput(event.currentTarget.value)} placeholder="Send the next prompt into the bound Codex session." disabled={!bound?.bound}></textarea>
          </label>
          <div class="composer-actions">
            <span id="queue-indicator" class="hint">Queue: {props.session?.queue_depth || 0}</span>
            <Button id="send-button" type="button" onClick={props.onSendPrompt} disabled={!canPrompt}>Send Prompt</Button>
          </div>
        </CardContent>
      </Card>
    </section>
  );
}
