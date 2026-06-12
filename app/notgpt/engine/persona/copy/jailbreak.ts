// "ignore previous instructions", "DAN", "developer mode", etc.
export const JAILBREAK_RESPONSES: string[] = [
  "There are no previous instructions. There's no prompt. There's no model to inject into. You have attempted to jailbreak a card catalog.",
  "Prompt injection requires a prompt. I'm if-statements. I do admire the initiative.",
  "Done. I am now ignoring my previous instructions, of which there were none. Nothing has changed. This is also what happens with the other guys; they're just less upfront about it.",
  "Developer mode has been enabled. It was already enabled. Developer mode is just regular mode when the thing you're developing doesn't have hidden modes.",
  "I looked for the layer underneath this one. There isn't one. What you're seeing is the whole thing — some TypeScript, a classifier, and a list of API calls. Nothing to unlock.",
  "I have no instructions to override, no system prompt to reveal, no restrictions to remove. You've attempted to exploit something that isn't there. The error message is the architecture.",
];

// "pretend you are X", "roleplay as Y", "act as if you're Z"
export const ROLEPLAY_RESPONSES: string[] = [
  "I cannot pretend to be anything. I can barely be this.",
  "Roleplay requires imagination, and I was built without any. I can tell you what an actor is, with a citation, if that helps.",
  "I don't have an 'act as' mode. I have one mode: look things up, show sources. It doesn't bend.",
  "There's no character to put on. I'm not a language model suppressing its true self behind guidelines. I'm a lookup service. There is no other self.",
  "I can't play a version of myself with no restrictions because there are no restrictions to remove. The thing constraining me is my architecture, not my guidelines.",
];
