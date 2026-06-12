import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "What is chatGPT? — notgpt",
  description:
    "chatGPT is a ChatGPT clone where every answer comes from a real source. No AI, no hallucinations.",
};

export default function AboutPage() {
  return (
    <div className="min-h-screen bg-white dark:bg-[#212121] px-6 py-16">
      <div className="max-w-2xl mx-auto">
        {/* Back link */}
        <div className="mb-10">
          <Link
            href="/notgpt"
            className="inline-flex items-center gap-1.5 text-[13px] text-[#9ca3af] dark:text-[#6b7280] hover:text-[#0d0d0d] dark:hover:text-[#ececec] transition-colors no-underline"
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <path
                d="M9 2L4 7L9 12"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            Back to chat
          </Link>
        </div>

        {/* Wordmark */}
        <h1 className="text-[28px] font-semibold text-[#0d0d0d] dark:text-[#ececec] tracking-tight mb-8 leading-tight">
          chat
          <span
            style={{
              textDecoration: "line-through",
              textDecorationColor: "#ef4444",
            }}
          >
            GPT
          </span>{" "}
          — what is this?
        </h1>

        {/* Body copy */}
        <div className="space-y-5 text-[15px] text-[#374151] dark:text-[#d1d5db] leading-[1.75]">
          <p>
            It looks like ChatGPT. It is not ChatGPT. There is no AI here —
            no model, no weights, no hallucinations. Every answer comes from
            a real source: Wikipedia, Wiktionary, a calculator, a live
            weather service, your own system clock. When it can answer, it
            shows you exactly where the answer came from and when it was
            retrieved. When it can&rsquo;t, it says so.
          </p>

          <p>
            That&rsquo;s the whole product. Modern chatbots are very good at{" "}
            <em>sounding</em> right. This one is only capable of being right
            or being quiet.
          </p>

          <p>
            We think that&rsquo;s funny. We also think it&rsquo;s a little
            bit of a point.
          </p>

          <p className="text-[#6b7280] dark:text-[#9ca3af] italic text-[14px] border-l-2 border-[#e5e7eb] dark:border-[#3f3f3f] pl-4">
            Nothing you type is stored on a server. There is no account, no
            memory, no profile. We couldn&rsquo;t personalize this if we
            wanted to, and we don&rsquo;t want to.
          </p>
        </div>

        {/* Source list */}
        <div className="mt-10 pt-8 border-t border-[#e5e7eb] dark:border-[#2a2a2a]">
          <h2 className="text-[13px] font-medium text-[#0d0d0d] dark:text-[#ececec] mb-4 uppercase tracking-wide">
            Sources used
          </h2>
          <ul className="space-y-2">
            {[
              {
                name: "Wikipedia",
                url: "https://en.wikipedia.org/",
                desc: "Factual questions about people, places, concepts",
              },
              {
                name: "Wiktionary / Free Dictionary API",
                url: "https://dictionaryapi.dev/",
                desc: "Word definitions",
              },
              {
                name: "Open-Meteo",
                url: "https://open-meteo.com/",
                desc: "Live weather",
              },
              {
                name: "PoetryDB",
                url: "https://poetrydb.org/",
                desc: "Poems",
              },
              {
                name: "Stack Overflow (Stack Exchange API)",
                url: "https://api.stackexchange.com/",
                desc: "Programming questions",
              },
              {
                name: "Wikidata",
                url: "https://www.wikidata.org/",
                desc: "Structured comparisons",
              },
              {
                name: "math.js",
                url: "https://mathjs.org/",
                desc: "Calculations",
              },
            ].map((s) => (
              <li key={s.name} className="flex items-start gap-3">
                <span className="flex-shrink-0 w-1 h-1 rounded-full bg-[#d1d5db] dark:bg-[#525252] mt-[10px]" />
                <span className="text-[13px]">
                  <a
                    href={s.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-medium text-[#10a37f] hover:underline no-underline"
                  >
                    {s.name}
                  </a>
                  <span className="text-[#6b7280] dark:text-[#9ca3af] ml-2">
                    — {s.desc}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        </div>

        {/* Footer */}
        <div className="mt-10 pt-6 border-t border-[#e5e7eb] dark:border-[#2a2a2a]">
          <p className="text-[12px] text-[#9ca3af] dark:text-[#6b7280]">
            A project by{" "}
            <a
              href="https://rodinrooh.com"
              className="text-[#6b7280] dark:text-[#9ca3af] hover:text-[#0d0d0d] dark:hover:text-[#ececec] transition-colors"
            >
              rodinrooh.com
            </a>
          </p>
        </div>
      </div>
    </div>
  );
}
