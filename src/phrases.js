// Phrases: what the interviewer says, per difficulty. Edit freely to change the tone.
// A random variant is picked each time so the interviewer does not repeat itself.
//
//   opening  before the first question
//   next     before each later question
//   repeat   when you ask to hear a question again
//   timeUp   when your answer time runs out
//   closing  at the end of the session

export const PHRASES = {
  easy: {
    opening: [
      "Hi, welcome! Relax and take your time. Let's start with the first question.",
      "Hello, great to see you. There's no rush. Here's the first question.",
    ],
    next: [
      "Nice one. Here's the next question.",
      "Thanks, that's helpful. Let's move on.",
      'Good. Ready for the next one?',
    ],
    repeat: ['Of course, let me say that again.', 'No problem, here it is once more.'],
    timeUp: [
      "That's the time, but well done. Let's move on.",
      "We're out of time for that one, and that's fine. On to the next.",
    ],
    closing: [
      "That's all of them. You did really well. Thanks for practising!",
      'All done. Nicely done, and see you next time.',
    ],
  },

  medium: {
    opening: [
      "Hello, thanks for joining. Let's begin with the first question.",
      "Good to meet you. Let's get started.",
    ],
    next: ['Thank you. Next question.', "Okay. Let's move to the next question.", 'Right. Moving on.'],
    repeat: ["Sure, I'll repeat that.", 'Let me say that again.'],
    timeUp: ["That's time. Let's move to the next question.", "I'll stop you there for time. Next question."],
    closing: [
      "That's the end of the interview. Thank you for your time.",
      "That covers everything I wanted to ask. Thanks for your time.",
    ],
  },

  hard: {
    opening: ["Let's get straight into it. First question.", 'We have a lot to cover. First question.'],
    next: ['Next.', 'Moving on.', 'Next question.'],
    repeat: ['Repeat.', 'Again.'], // not used while repeat is switched off on hard
    timeUp: ["Time. Moving on.", "That's time. Next."],
    closing: ["That's it. Thank you.", "We're done. Thanks for your time."],
  },
};

// Pick a random phrase of one kind for one difficulty.
export function pickPhrase(difficulty, kind) {
  const list = PHRASES[difficulty]?.[kind] || [];
  return list[Math.floor(Math.random() * list.length)] || '';
}

// The tone Claude is asked to use when marking answers in Coach mode.
export const TONE = {
  easy: 'warm and encouraging',
  medium: 'neutral and professional',
  hard: 'strict and challenging, but fair',
};
