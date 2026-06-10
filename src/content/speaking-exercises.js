/**
 * Speaking practice exercises — 10 prompts per CEFR level (A1–C2).
 * Imported via `npm run seed:speaking`.
 */

const LEVELS = ["A1", "A2", "B1", "B2", "C1", "C2"]

const PROMPTS = {
  A1: [
    { text: "What is your name?", hint: "Say your full name clearly.", explanation: "Check pronunciation of name; basic fluency." },
    { text: "How old are you?", hint: "Use a full sentence: I am … years old.", explanation: "Numbers and simple sentence structure." },
    { text: "Where do you live?", hint: "Mention your city or town.", explanation: "Place vocabulary and present simple." },
    { text: "What do you do? Are you a student or do you work?", hint: "Describe your job or studies.", explanation: "Occupation vocabulary." },
    { text: "What is your favourite food?", hint: "Name the food and say why you like it.", explanation: "Food vocabulary and likes/dislikes." },
    { text: "Do you have any brothers or sisters?", hint: "Talk about your family.", explanation: "Family vocabulary and yes/no answers." },
    { text: "What time do you usually wake up?", hint: "Use o'clock or half past.", explanation: "Time expressions." },
    { text: "What is your favourite colour?", hint: "Say the colour and what you have in that colour.", explanation: "Adjectives and simple description." },
    { text: "Can you describe your room?", hint: "Mention furniture and size.", explanation: "There is/are and basic adjectives." },
    { text: "What do you like to do in your free time?", hint: "List two or three activities.", explanation: "Hobbies and like + -ing." },
  ],
  A2: [
    { text: "Tell me about your hometown.", hint: "Where it is, how big it is, what you like about it.", explanation: "Location description and opinions." },
    { text: "What did you do last weekend?", hint: "Use past simple verbs.", explanation: "Past tense narrative." },
    { text: "Describe your daily routine.", hint: "From morning to evening.", explanation: "Sequence and frequency adverbs." },
    { text: "What kind of music do you like and why?", hint: "Give reasons with because.", explanation: "Preferences and reasons." },
    { text: "Tell me about a friend you have known for a long time.", hint: "How you met and what you do together.", explanation: "Past and present tenses." },
    { text: "What are you going to do this evening?", hint: "Use going to or will.", explanation: "Future plans." },
    { text: "Describe your favourite shop or market.", hint: "What you can buy there.", explanation: "Shopping vocabulary." },
    { text: "Have you ever been to another country? Tell me about it.", hint: "Use present perfect if possible.", explanation: "Travel experiences." },
    { text: "What is your favourite season? Why?", hint: "Weather and activities.", explanation: "Seasons and reasons." },
    { text: "Compare living in a city and living in a village.", hint: "Mention advantages of each.", explanation: "Comparison language." },
  ],
  B1: [
    { text: "Describe a place you would like to visit and explain why.", hint: "Use would like to and reasons.", explanation: "Desire and justification." },
    { text: "Tell me about a time when you had to solve a problem.", hint: "What happened and what you did.", explanation: "Narrative with past tenses." },
    { text: "What are the advantages and disadvantages of social media?", hint: "Give at least one of each.", explanation: "Balanced opinion." },
    { text: "Describe a book or film that made an impression on you.", hint: "Summarise the plot briefly.", explanation: "Summary and personal reaction." },
    { text: "How important is learning English in your country?", hint: "Give examples from work or study.", explanation: "Abstract topic with examples." },
    { text: "Tell me about a hobby you started recently.", hint: "When, why, and how often.", explanation: "Present perfect and habits." },
    { text: "What would you do if you won a lot of money?", hint: "Use second conditional.", explanation: "Hypothetical situations." },
    { text: "Describe a person who has influenced you.", hint: "Who they are and how they helped you.", explanation: "Character description." },
    { text: "Do you think young people today face more pressure than in the past?", hint: "Give your opinion with examples.", explanation: "Opinion and comparison." },
    { text: "Tell me about an event you are looking forward to.", hint: "When it is and why it excites you.", explanation: "Future plans and enthusiasm." },
  ],
  B2: [
    { text: "Describe a skill you would like to learn and explain how it would benefit you.", hint: "Be specific about the benefits.", explanation: "Goal-setting and justification." },
    { text: "Some people say technology makes life easier; others say it creates new problems. Discuss.", hint: "Present both sides then your view.", explanation: "Balanced argument." },
    { text: "Tell me about a time when you had to adapt to a change.", hint: "Focus on your feelings and actions.", explanation: "Narrative with reflection." },
    { text: "How important is work-life balance in modern society?", hint: "Refer to stress, family, or health.", explanation: "Social issues vocabulary." },
    { text: "Describe a project or achievement you are proud of.", hint: "Explain your role and the outcome.", explanation: "Achievement narrative." },
    { text: "Should governments invest more in public transport or roads?", hint: "State your preference and reasons.", explanation: "Policy opinion." },
    { text: "Tell me about a tradition in your culture.", hint: "When it happens and what people do.", explanation: "Cultural description." },
    { text: "What role does education play in career success?", hint: "Use examples from your experience.", explanation: "Abstract reasoning with evidence." },
    { text: "Describe a difficult decision you had to make.", hint: "What options you considered.", explanation: "Decision-making narrative." },
    { text: "How has your area changed in the last ten years?", hint: "Mention buildings, jobs, or lifestyle.", explanation: "Change over time." },
  ],
  C1: [
    { text: "To what extent do you agree that artificial intelligence will transform the job market?", hint: "Qualify your agreement — partly, largely, etc.", explanation: "Nuanced agreement and prediction." },
    { text: "Describe a situation where communication broke down and how you handled it.", hint: "Analyse what went wrong.", explanation: "Problem-solving narrative." },
    { text: "How far should governments regulate social media platforms?", hint: "Balance free speech and safety.", explanation: "Policy debate." },
    { text: "Tell me about a time when you had to persuade someone to change their mind.", hint: "What arguments you used.", explanation: "Persuasion strategies." },
    { text: "What are the implications of climate change for your country's economy?", hint: "Mention sectors affected.", explanation: "Cause-effect analysis." },
    { text: "Describe a leader you admire and the qualities they demonstrate.", hint: "Give concrete examples.", explanation: "Leadership vocabulary." },
    { text: "How has globalization affected local cultures in your view?", hint: "Positive and negative effects.", explanation: "Globalisation debate." },
    { text: "Discuss the balance between individual freedom and collective security.", hint: "Use a real-world example.", explanation: "Ethical dilemma." },
    { text: "Tell me about a complex issue you have researched recently.", hint: "Summarise your findings.", explanation: "Academic-style summary." },
    { text: "What changes would you make to the education system in your country?", hint: "Prioritise one or two reforms.", explanation: "Reform proposals." },
  ],
  C2: [
    { text: "Critically evaluate whether economic growth should be prioritised over environmental protection.", hint: "Weigh short-term vs long-term interests.", explanation: "Critical evaluation." },
    { text: "Describe a paradigm shift in your thinking on a significant issue.", hint: "What changed your perspective.", explanation: "Reflective discourse." },
    { text: "To what extent is privacy compatible with national security in the digital age?", hint: "Consider surveillance and rights.", explanation: "Sophisticated argument." },
    { text: "Discuss the ethical implications of genetic engineering in humans.", hint: "Mention benefits and risks.", explanation: "Ethics and science." },
    { text: "Tell me about a time when you challenged established norms or conventions.", hint: "Explain the outcome.", explanation: "Critical thinking narrative." },
    { text: "How might remote work reshape urban development over the next two decades?", hint: "Speculate with evidence.", explanation: "Future speculation." },
    { text: "Analyse the causes and consequences of political polarisation in modern democracies.", hint: "Structure: causes → effects.", explanation: "Political analysis." },
    { text: "Describe a work of art, literature, or philosophy that fundamentally altered your perspective.", hint: "Explain the ideas and impact.", explanation: "Cultural criticism." },
    { text: "How should societies balance meritocracy with equity in resource distribution?", hint: "Define both concepts briefly.", explanation: "Social philosophy." },
    { text: "Speculate on how artificial intelligence might redefine human creativity.", hint: "Consider collaboration vs replacement.", explanation: "Abstract speculation." },
  ],
}

const LEVEL_META = {
  A1: { difficulty: "easy", estimatedTime: 15, prepTime: 15, speakTime: 30 },
  A2: { difficulty: "easy", estimatedTime: 18, prepTime: 20, speakTime: 45 },
  B1: { difficulty: "medium", estimatedTime: 20, prepTime: 30, speakTime: 60 },
  B2: { difficulty: "medium", estimatedTime: 25, prepTime: 45, speakTime: 90 },
  C1: { difficulty: "hard", estimatedTime: 30, prepTime: 60, speakTime: 120 },
  C2: { difficulty: "hard", estimatedTime: 35, prepTime: 60, speakTime: 150 },
}

export function buildSpeakingCatalog() {
  const topics = []
  const exercises = []

  LEVELS.forEach((level, idx) => {
    const topicSlug = `speaking-${level.toLowerCase()}`
    const prompts = PROMPTS[level]
    const meta = LEVEL_META[level]

    topics.push({
      slug: topicSlug,
      title: `Speaking — ${level}`,
      description: `Practice speaking with ${prompts.length} prompts at ${level} level. Record your answers and submit for teacher review.`,
      levels: level,
      exerciseCount: 1,
      questionCount: prompts.length,
      totalMinutes: meta.estimatedTime,
      color: "rose",
      order: 100 + idx,
    })

    exercises.push({
      slug: `speaking-practice-${level.toLowerCase()}`,
      title: `Speaking Practice — ${level}`,
      description: `${prompts.length} speaking prompts for ${level} learners. Record your answer to each question.`,
      category: "speaking",
      topic: topicSlug,
      subtopic: "practice",
      difficulty: meta.difficulty,
      level,
      type: "speaking",
      estimatedTime: meta.estimatedTime,
      totalQuestions: prompts.length,
      passingScore: prompts.length,
      tags: ["speaking", level, "IELTS"],
      instructions:
        "Read each question, prepare your answer, then tap Record. You can pause, listen to your recording, and re-record before submitting.",
      tips: [
        "Speak clearly and at a natural pace.",
        "Use the preparation time to organise your ideas.",
        "Listen to your recording before submitting.",
      ],
      content: {
        questions: prompts.map((p, i) => ({
          id: i + 1,
          text: p.text,
          hint: p.hint,
          explanation: p.explanation,
          prepTimeSeconds: meta.prepTime,
          speakTimeSeconds: meta.speakTime,
        })),
      },
    })
  })

  return { topics, exercises }
}
