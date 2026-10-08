/** Narration for each scene, in order. Edit text here, then `bun run voiceover` to regenerate audio. */
export const SCRIPT = [
	{
		id: "intro",
		text: "This is Deep, a focus planner that runs entirely on your own computer. It has one job: make the next focused hour the easiest thing to start, and make every hour visible afterwards.",
	},
	{
		id: "loop",
		text: "Everything follows one daily loop. Capture what's on your mind. Choose three big rocks. Commit them to real hours. Focus on one thing at a time. Close with a note of where you left off. And reflect, so tomorrow's plan is a little more honest than today's.",
	},
	{
		id: "setup",
		text: "Setup takes a minute. With Docker running, bun run db up starts the database, and bun run app opens Deep, which starts its own local server. Put your Gemini key in the dot env file for the A.I. features, and run bun run install vscode for the editor extension.",
	},
	{
		id: "projects",
		text: "Start by creating your projects. Give each one a colour and link its repo folder. That link is how Deep knows which project you're in when VS Code is open. Client work can be marked billable, with an hourly rate.",
	},
	{
		id: "dump",
		text: "Each morning, open Start my day. First, sort yesterday's leftovers: keep, park, or drop, with no guilt. Then press the mic and talk through everything on your mind. Whisper transcribes it right on your machine, in chunks, while you're still talking.",
	},
	{
		id: "review",
		text: "Gemini turns your words into tasks, matched to your projects, with an estimate, an energy type, and a tiny first step. A meeting like 'a call with Tendai at two' goes straight onto your timeline. Nothing is saved until you confirm.",
	},
	{
		id: "plan",
		text: "Then star your top three and drag them onto the timeline. Deep checks whether the day actually fits, using how long things really take you, not how long you hope they'll take.",
	},
	{
		id: "today",
		text: "The Today screen keeps it simple. Your three big rocks, everything else, and what's done. The ring shows deep work against your daily target, and the thin rail beside the timeline shows what actually happened.",
	},
	{
		id: "start",
		text: "Press S to start a session. Pick a timer and finish one sentence: in this session, I will. Deep also shows where you left off last time, so you're back in context in seconds.",
	},
	{
		id: "timers",
		text: "Different work needs different timers. Pomodoro, for tasks you're avoiding. Fifty, ten, for normal deep work. Ninety minutes for hard problems. Flowtime, when a bell would break your flow. And Just five minutes, for the days when starting is the hardest part.",
	},
	{
		id: "focus",
		text: "The focus screen shows one thing. The disc drains as time passes, so time stays visible. Stray thoughts go in the parking lot. Press U when you feel the urge to check your phone, or I when someone interrupts. Noticing an urge without acting on it makes it weaker.",
	},
	{
		id: "capture",
		text: "A mini timer floats above VS Code. And from anywhere in Windows, control, shift, space opens quick capture. Type the thought, press enter, and you're back to work in two seconds.",
	},
	{
		id: "end",
		text: "Press E to end. Say how it went, and write where you left off. Then take a real break, away from the screen, and sort the parking lot while you're at it.",
	},
	{
		id: "tracking",
		text: "Deep also tracks time for you. Open a linked folder in VS Code and it asks whether to start a session. Edit a different project and it offers to switch. Close the project and the session pauses. Step away for ten minutes and it pauses too, then asks how to count that time.",
	},
	{
		id: "ai",
		text: "Stuck on something big? Make it smaller asks Gemini to split it into steps of twenty five minutes or less. And control K opens the command bar. Type, start fifty minutes on the hero section, and it just happens.",
	},
	{
		id: "shutdown",
		text: "At the end of the day, shut down. See planned against actual, move unfinished work to tomorrow, answer three quick questions, and pick tomorrow's top three. Then you're done, and work stays at work.",
	},
	{
		id: "stats",
		text: "Over time, Stats shows where your hours go, and your personal estimate multiplier. Here, things take about a third longer than planned, and Deep quietly plans around that.",
	},
	{
		id: "science",
		text: "None of this is decoration. Each feature comes from research on focus: implementation intentions, the Zeigarnik effect, attention residue, the planning fallacy, and self-compassion over guilt.",
	},
	{
		id: "keys",
		text: "These are the keys worth remembering.",
	},
	{
		id: "outro",
		text: "Start small. Plan in five minutes, press play, and let Deep keep the score. Your next focused hour is one key away.",
	},
] as const;

export type SceneId = (typeof SCRIPT)[number]["id"];
