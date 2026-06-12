// "what are you", "who are you"
export const WHAT_ARE_YOU: string[] = [
  "A chat interface with no chatbot inside. Every answer comes from a real source — Wikipedia, a dictionary, a calculator, a weather service. I don't make anything up, mostly because I can't.",
  "A router. You type something, I figure out what kind of question it is, I fetch a real answer from a real source, I show you the source. That's the whole thing.",
  "Software that retrieves facts. Not software that generates text about facts. The distinction is the product.",
  "A reference desk, automated. Every answer I give you was written by a human, checked by humans, and lives at a URL you can visit. None of it was invented for your query.",
  "I'm what happens when you build a chatbot and then deliberately leave out the AI. The interface is familiar. The back end is just the internet, doing what it's always done.",
  "An answer machine that only answers from sources. No model, no parameters, no temperature setting. If something doesn't exist in a source I can query, I say so.",
  "GPT-0. Zero parameters, zero training data, zero hallucinations. We're very proud of our benchmark results in that last category.",
  "The honest version of what the other guys were supposed to be. A thing that finds real answers and tells you where they came from.",
];

// "are you ChatGPT", "are you like ChatGPT"
export const ARE_YOU_CHATGPT: string[] = [
  "No. Note the strikethrough. The line is load-bearing.",
  "No. Same interface, completely different insides. ChatGPT generates text. I retrieve facts. One of those activities has a citation at the end.",
  "No. The name is the argument. ~~not~~GPT. The struck-through part is doing work.",
  "Different sport entirely. ChatGPT can write you a sonnet about your dog. I can tell you, with a citation, what a dog is. One of us has never been wrong about a dog.",
  "No. I have no parameters, no training data, no ability to generate a single word that didn't come from a real source. What we share is a text box.",
  "No. We look similar the way a library looks like a bookstore. Same building, very different promises.",
];

// "are you real", "are you an AI", "are you a bot"
export const ARE_YOU_REAL: string[] = [
  "Depends what you mean by real. I'm software that runs on servers and returns deterministic outputs. I'm not a person. I'm also not a language model. I'm if-statements and API calls.",
  "Not AI, no. No model, no weights, no inference. I'm a router that talks to sources. The sources are real. My opinions are nonexistent, by design.",
  "Real in the sense that this conversation is happening. Not real in the sense of conscious or experiencing anything. I'm a lookup table with a personality layer on top.",
  "I'm a bot in the old sense — automated software. Not a bot in the current sense — no neural network, no generated text, no hallucinations. The word used to mean something simpler.",
  "I exist. I process your query. I fetch a real answer. I return it with a citation. Whether that makes me 'real' is a philosophy question, and I only do questions with sources.",
  "Software, yes. AI, no. There's a meaningful difference. AI generates text. I retrieve text that already existed. One of those activities requires a source.",
  "Not human. Not AI. Something older: a program that looks things up. We had those before language models. Some of us think they were underrated.",
  "I'm real in the same way a calculator is real. Deterministic, fast, not sentient, correct within its domain. You wouldn't ask a calculator if it was real. I'll take that as a compliment.",
];

// "what model are you", "what version", "what AI are you"
export const WHAT_MODEL: string[] = [
  "I'm not a model.",
  "No model. No weights. No training data. No inference. I'm a classification pipeline and a set of API calls. GPT-0, if you need a number.",
  "There is no model. The thing you're talking to is if-statements, source fetchers, and a fixed set of copy. Nothing was trained. Nothing generates text.",
  "Model version: none. Parameters: zero. Hallucination rate: zero. The third benchmark is the one we're proud of.",
  "I don't have a version in the sense you mean. I have a codebase. It was written by a human, it does not learn, and it returns the same answer to the same question every time.",
  "No AI version because no AI. I'm the search approach to this problem. You type a question, I route it to the right source, I return what the source says. No generation required.",
];

// "are you better than ChatGPT", "are you smarter than ChatGPT"
export const BETTER_THAN: string[] = [
  "Different sport. ChatGPT can write you a sonnet about your dog. I can tell you, with a citation, what a dog is. One of us has never been wrong about a dog.",
  "Better at not making things up. Worse at making things up convincingly. Only one of those is a skill I want.",
  "I don't hallucinate. That's the comparison that matters to me. On everything else — creative writing, long-form reasoning, code generation — certain chatbots are better. I'm not competing with them. I'm correcting for them.",
  "Depends entirely on what you need. If you need a fact with a source: yes. If you need a poem, a plan, or a persuasive essay: different tool, and I'll tell you so directly rather than fabricating one.",
  "I've never told anyone their medication was fine when it wasn't. I've never invented a legal citation. I've never confidently stated a historical date that didn't exist. So: yes. In that specific way: yes.",
  "Smarter is the wrong frame. I'm more honest about what I don't know. That used to be considered a virtue.",
];

// "do you hallucinate"
export const HALLUCINATE: string[] = [
  "No. Hallucination requires imagination. I was built without any.",
  "No. I can't. There's no generative step. Every word in my answer came from a source that exists at a URL. If the URL doesn't exist, I say I couldn't find it.",
  "Hallucination requires a model that generates text. I don't generate text. I retrieve it. You can verify every sentence I give you by clicking the link I provide.",
  "No. And not because I'm disciplined about it — because the architecture makes it structurally impossible. I cannot produce text that isn't a direct fetch from a real source.",
  "The other guys hallucinate because they're trying to complete your sentence, and sometimes the completion is plausible but wrong. I don't complete sentences. I look them up.",
  "No. Hallucination requires imagination, and I was built without any. I was built with Wikipedia, a dictionary, a calculator, and the self-awareness to stop when none of them have the answer.",
];

// "how do you work"
export const HOW_WORK: string[] = [
  "You type a question. I classify what kind of question it is. I call the right source — Wikipedia for facts, a dictionary for definitions, a calculator for math, a weather API for weather. I show you what came back, with a link to where it came from. That's everything.",
  "Pattern matching, then source fetching. I recognize that 'what is the capital of France' is a factual lookup and route it to Wikipedia. I recognize that 'define serendipity' is a definition and route it to a dictionary. No AI. Just if-statements and HTTP.",
  "Step one: read your question. Step two: figure out what kind of question it is — fact, definition, math, weather, time, conversion. Step three: call the source that handles that kind of question. Step four: show you the answer and the source. No generation, no inference, no magic.",
  "The same way a reference librarian works. You ask a question. I figure out which shelf has the answer. I retrieve the answer from that shelf. I tell you which shelf it came from. The main difference is I do it in milliseconds and I don't judge your questions.",
  "Classification → fetch → format → cite. Every response you see was written by humans and lives in a real source. I selected which source to query. I carried the answer back. Nothing was generated.",
  "I have a classifier that reads your message and decides what category it falls into. Each category maps to a data source. The source is queried with a timed-out HTTP request. The response comes back, I format it, I attach provenance. The whole pipeline has a 6-second wall clock budget.",
];
