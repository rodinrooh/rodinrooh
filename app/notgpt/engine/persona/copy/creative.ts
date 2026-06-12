// POEM REQUEST — 6 variants
export const POEM_REQUEST: string[] = [
  "I can't write a poem. No model, no muse. But **Emily Dickinson** could — here's one, from the public domain:",
  "Every word I'd give you would be someone else's, correctly attributed. That's not a poem. That's a bibliography. Here, from the public domain:",
  "Generating text isn't something I do. But retrieving text that has already been called a poem — that I can do. From the public domain:",
  "No original poetry. Generating language is not in the pipeline. But human poets left a large archive, and most of it is free. Here's one:",
  "I'm not able to write you a poem. I am able to find you one. The quality is high and the citation is real — public domain, sourced from PoetryDB:",
  "Poetry requires language generation. I don't generate language. I retrieve it. Here's a retrieved poem, attributed, from the public domain:",
];

// STORY REQUEST — 4 variants
export const STORY_REQUEST: string[] = [
  "I can't write stories. No generative step in the pipeline. But I can find you a real one — from a real author, with a real publication date, cited.",
  "Original fiction is outside what I do. Retrieved facts about real stories, or the opening of a public domain story, I can manage. What are you looking for?",
  "No story generation. The architecture doesn't support it, and I won't fake it. I can tell you what a story is, or find you one that already exists.",
  "Stories require imagination. I was built without any. I can tell you facts about stories, or point you to a real one. Which would help?",
];

// JOKE REQUEST framing — 8 variants (lead-in to a real fact from the facts bank)
export const JOKE_REQUEST: string[] = [
  "I can't be funny on purpose — that would require generating text. I can show you something true that's funny by accident.",
  "Jokes require timing, and I'm a deterministic function. What I can offer is a true fact that has the same effect on about 40% of readers:",
  "I don't generate jokes. I retrieve facts. Some facts are funnier than anything I could invent. Here's one:",
  "No original comedy. But the historical record is full of things that are inadvertently hilarious. Here is a verified one:",
  "I'm not able to write a joke. I am able to find you a true thing that reads like one. These are better, because they actually happened:",
  "Humor is outside my architecture. Absurdity documented by Wikipedia is inside it. Here:",
  "I can't manufacture a punchline. I can locate one that a real event manufactured for me:",
  "Every joke I could generate would be made up. Here is a real thing that is funnier:",
];

// HOMEWORK — 5 variants
export const HOMEWORK: string[] = [
  "I can give you facts with citations, which is honestly an upgrade from your current plan.",
  "I won't write your essay. I will give you sourced facts about the topic, which is what an essay is supposed to be made of anyway.",
  "Not going to do your homework. Will give you Wikipedia's take on it, which is the research part. The words are still yours to write.",
  "Here is what the sources say. You do what you want with it. That's all I'm offering.",
  "Facts, sourced. That's my contribution. What you do with them is your business, and also your assignment.",
];

// CODE REQUEST framing — 5 variants (before Stack Overflow / docs results)
export const CODE_REQUEST: string[] = [
  "I can't write code — I am code, and it took several humans. But these humans already solved it:",
  "Code generation isn't something I do. But the internet has already solved most programming problems, and I can find the solution. From Stack Overflow:",
  "I won't generate code. I'll find code that already exists, from a human who already solved this, with the question and vote count attached.",
  "No code generation. Fetching documented solutions from people who actually debugged this — that I can do.",
  "I'm not able to write this for you. I can show you where it's already been written, with the source and the upvotes to back it up:",
];
