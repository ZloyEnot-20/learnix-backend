/**
 * Patch Cambridge Vocab seed JSON:
 * - Unit 2: Remnants of the past reading (pages 15–17)
 * - Unit 3: Individuality exercises (page 18)
 * - Top-level `pages` index for book-order browsing
 * Syncs backend + front copies.
 */
import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, "../..")
const BACKEND = path.join(ROOT, "src/data/books/cambridge-vocab-ielts-advanced.json")
const FRONT = path.resolve(ROOT, "../learnix-front/data/books/cambridge-vocab-ielts-advanced.json")

const REMNANTS_PASSAGE = `In a museum laboratory, Irene Good is studying pieces of silk from long-lost cloth found at archaeological sites in western Europe and central and south Asia. Good immerses the threads in a solution to tease apart the strands of protein. Then she uses several methods of biochemical analysis to examine the proteins' amino acids. What amino acids are present and the order they are in vary in different species of moths and therefore give a clue to the place where the silk was made.

'What I love most is being able, not just to alter what's known, but to improve access to the past based on very tiny pieces of evidence. Until recently, it was assumed that all ancient silk was from China,' says Good, a specialist in fibre analysis and ancient-textile production and trade at Harvard University's Peabody Museum. 'Scholars held that any silk dating from 2400 to 700 B.C. was carried afar on trade routes from China. But our work is now calling that assumption into question.' Her findings indicate that the ancient silk came not from domesticated Chinese silkworms but from species of wild moths native to western Europe and Asia. 'Now it looks like some of the silk industry outside China was earlier than thought and more widespread,' Good says.

Today, Good and other researchers are applying high-tech methods of chemical analysis to ancient textiles and fibres to glean unique clues about past civilisations. The results are shedding light on many aspects of daily life among early peoples. Much of the insight is coming from minuscule samples of textiles, which archaeologists categorise as 'fibre perishables'. Until recently, these remains were usually overlooked because they were frayed, discoloured or too fragile to withstand the rigours of analysis.

'Because textiles are organic, they're subject to biological deterioration from air, water, minerals, insects and fungi. All kinds of things attack organic material and use it as their dinner,' says Joseph Lambert of Northwestern University in Illinois. He is a pioneer in the use of analytical-chemical techniques for the study of archaeological materials.

Most cloth and other textile fibre degrade over time and eventually disappear. However, according to Lambert, in some cases ancient textiles survived well because they'd spent centuries in arid, freezing or low-oxygen environments, such as well-sealed tombs. Scientific interest in ancient textiles and other fibre objects is burgeoning. 'Today, we're finally combining archaeological background with training in scientific instrumentation to put it all together,' says Lambert.

Chemical analysis and powerful microscopy can reveal remarkable characteristics of textiles: what plants and animals the fibres came from, how the yarns were made, what weaving techniques were employed and what dyes or pigments were used to colour them. Such information, combined with other evidence, enables researchers to infer the technological skills of ancient civilisations and the cultural importance of their textiles, notes Kathryn Jakes of Ohio State University in Columbus.

Among the fabric samples Jakes has analysed are carbonised scraps from Hopewell burial sites, which were typically earth mounds. Analyses have revealed decorative patterns indicating that at least some of the now-faded Hopewell-era textiles had been coloured. 'The presence of colour reflects a significant level of technology, including knowledge of colourants in nature and of methods required to affix them to organic materials,' says Jakes. She and her colleagues have conducted experiments to find out what combinations of plants and minerals the Hopewell groups may have used to produce various colours. Prehistoric people probably used plants like sumac and bedstraw as dyes, Jakes says, because caches of those seeds have been recovered from archaeological sites although the plants have no known dietary use. In one set of experiments, for example, the researchers made dye baths from sumac berries and bedstraw roots combined with different mineral fixatives. When the researchers tested the baths on fibres from milkweed plants and rabbit hair, only one combination – sumac, bedstraw and potassium carbonate – produced a deep red that was colourfast.

Richard Evershed of the University of Bristol is another pioneer in the chemical analysis of organic archaeological materials. In the Sept. 16 issue of Nature, he and his colleagues describe their study of cloth wrappings from animal mummies of Ancient Egypt. The Egyptians preserved millions of mammals, birds and reptiles as votive offerings. Scholars had assumed that ancient people used relatively simple and inexpensive methods to prepare this multitude of animals for burial. Evershed's findings call that assumption into question. His team analysed samples from cat, hawk and ibis mummies. The embalming substances turned out to include fairly exotic materials, such as oils, beeswax, sugar gum and tree resins and were as complex as those used for human mummification. Evershed suggests that the Ancient Egyptians had surprisingly sophisticated knowledge of how to use various preservatives.

The study of ancient textiles and other organic materials is a much-needed counterpoint to the traditional archaeological focus on objects made of stone, bone, metal and clay, says Penelope Drooker of the New York State Museum in Albany. Evidence from tools and weapons can lead to skewed interpretations of past life, she says. Until fairly recently in human history, Drooker points out, perishable goods comprised a large part of materials of everyday life. At some archaeological sites in western North America, for example, an estimated 95 per cent of recovered artefacts were made of wood, bark, plant fibre, leather, fur or feathers.

As sophisticated techniques of analysis have revealed more detailed information about ancient textiles, scholars have been rethinking ideas about the early development of skills such as spinning and weaving. Fibre samples found in caves in France had convinced scientists that textile production first arose about 15,000 years ago. Now, some scholars assert that weaving and cloth making developed considerably earlier. After examining early representations of human clothing, Elizabeth Barber of Occidental College in Los Angeles concluded that textile weaving is at least 20,000 years old. A specialist in the Bronze Age and Neolithic cultures of the Aegean and southeast Europe, she has argued that fibre-making expertise was as revolutionary as the creation of equipment for working with stone and metal. Learning to twist plant and animal fibres into string-like yarns enabled prehistoric people to weave nets, baskets and other objects that eased the chores of everyday life, Barber explains in her extensive writings. As the tasks of providing food, clothing and shelter were divided between men and women in tribal societies, she says, women became the primary weavers because they could perform that activity while tending children.`

const UNIT2_READING = {
  section_type: "reading",
  subtype: "Test practice",
  exercises: [
    {
      exercise_id: "reading_passage",
      instruction:
        "You should spend about 20 minutes on Questions 1–13, which are based on the Reading Passage below.",
      title: "Remnants of the past",
      passage: REMNANTS_PASSAGE,
      questions: [],
    },
    {
      exercise_id: "reading_1_6",
      instruction:
        "Questions 1–6. Match each statement with the correct person. Write the correct letter, A–E, next to questions 1–6. NB You may use any letter more than once.",
      passage: REMNANTS_PASSAGE,
      options: [
        { letter: "A", text: "Good" },
        { letter: "B", text: "Lambert" },
        { letter: "C", text: "Jakes" },
        { letter: "D", text: "Drooker" },
        { letter: "E", text: "Barber" },
      ],
      test_tip:
        "In the IELTS Reading test, some of the questions will be in the same order as the passage and some will not. For items that ask you to match people with statements or theories, the people in the box will be in the same order as the passage, but the questions will be mixed up.",
      questions: [
        {
          number: 1,
          statement: "Very old cloth can be preserved by the conditions around it.",
          answer: "B",
        },
        {
          number: 2,
          statement:
            "The ability to create things out of cloth had as great an impact on society as the invention of tools.",
          answer: "E",
        },
        {
          number: 3,
          statement: "Evidence has led to a re-evaluation of where certain materials originated.",
          answer: "A",
        },
        {
          number: 4,
          statement: "Studying cloth can teach us about the expertise of early peoples.",
          answer: "C",
        },
        {
          number: 5,
          statement: "We can use very small remnants of cloth to learn about ancient life.",
          answer: "A",
        },
        {
          number: 6,
          statement: "Archaeologists can get misleading information from objects used for fighting.",
          answer: "D",
        },
      ],
    },
    {
      exercise_id: "reading_7_13",
      instruction:
        "Questions 7–13. Do the following statements agree with the claims of the writer in the Reading Passage? Write YES if the statement agrees with the claims of the writer, NO if the statement contradicts the claims of the writer, or NOT GIVEN if it is impossible to say what the writer thinks about this.",
      passage: REMNANTS_PASSAGE,
      test_tip:
        "Yes / No / Not given items are similar to True / False / Not given items. Both of them will be in the same order as the information in the passage. The only difference is that Yes / No / Not given items are based on the opinions of the writer and True / False / Not given items are based on facts within the passage.",
      questions: [
        {
          number: 7,
          statement: "Information about an insect can offer evidence about the origins of a piece of cloth.",
          answer: "YES",
        },
        {
          number: 8,
          statement: "Scientists have long realised the potential of ancient scraps of material.",
          answer: "NO",
        },
        {
          number: 9,
          statement: "According to Lambert, we can predict the amount of time that organic materials can last.",
          answer: "NOT GIVEN",
        },
        {
          number: 10,
          statement: "Joseph Lambert has led the way in research techniques of archaeological artefacts.",
          answer: "YES",
        },
        {
          number: 11,
          statement: "Jakes' experiments with dye were the first of this kind to be carried out.",
          answer: "NOT GIVEN",
        },
        {
          number: 12,
          statement:
            "Evershed's evidence supports the theory that Ancient Egyptians used a basic method to preserve mummies.",
          answer: "NO",
        },
        {
          number: 13,
          statement: "Researchers have used new data to question previous theories about the expertise of early people.",
          answer: "YES",
        },
      ],
    },
  ],
}

const UNIT3_SECTIONS = [
  {
    section_type: "vocabulary",
    subtype: "Individuality",
    exercises: [
      {
        exercise_id: "1.1",
        instruction: "How do people use these things to express their individuality?",
        items: ["clothes", "bedroom", "car", "internet", "music", "hairstyle"],
      },
      {
        exercise_id: "1.2",
        instruction:
          "Listen to someone talking about individuality and tick the things in 1.1 that he mentions.",
        audio_track: "06",
        items: ["clothes", "bedroom", "car", "internet", "music", "hairstyle"],
      },
      {
        exercise_id: "1.3",
        instruction:
          "Now listen again and notice these phrasal verbs. Which two have a similar meaning?",
        audio_track: "06",
        items: ["blend in with", "stand out from", "fit in with"],
      },
      {
        exercise_id: "1.4",
        instruction:
          "Check the meanings of the phrasal verbs in the box. Replace the underlined phrases in the sentences below with a phrasal verb from the box. There may be more than one possible answer.",
        words: [
          "fit in (with)",
          "stand out (from)",
          "break away (from)",
          "opt out (of)",
          "blend in (with)",
          "drop out (of)",
          "join in",
        ],
        items: [
          {
            sentence: "I feel uncomfortable if I'm forced to _____ group activities.",
            answer: "join in",
            original: "participate in",
          },
          {
            sentence: "I don't like to _____ in the crowd.",
            answer: "stand out (from)/stand out",
            original: "be noticeable",
          },
          {
            sentence: "I'd rather _____ everyone else.",
            answer: "blend in (with)/blend in",
            original: "look the same as",
          },
          {
            sentence:
              "My friends started going out late to nightclubs so I decided to _____ the group.",
            answer: "break away (from)/break away",
            original: "dissociate myself from",
          },
          {
            sentence:
              "When people feel isolated and rejected, they sometimes _____ society altogether.",
            answer: "drop out (of)/drop out/opt out (of)/opt out",
            original: "abandon",
          },
          {
            sentence:
              "New migrants may feel that by changing to _____ their new community, they are losing some part of their individuality.",
            answer: "fit in (with)/fit in/blend in (with)/blend in",
            original: "assimilate into",
          },
        ],
      },
      {
        exercise_id: "2.1",
        instruction:
          "Read the passage on the opposite page and complete these sentences with the correct ending (A–F).",
        passage:
          "(Use the reading passage about tattoos / individuality on the opposite page in the coursebook.)",
        options: [
          { letter: "A", text: "stereotypical." },
          { letter: "B", text: "a more tolerant attitude." },
          { letter: "C", text: "harmful to society." },
          { letter: "D", text: "behaviour patterns." },
          { letter: "E", text: "self-destructive." },
          { letter: "F", text: "approved of by society." },
        ],
        questions: [
          {
            number: 1,
            statement: "In the past, tattoos were judged to be",
            answer: "C",
          },
          {
            number: 2,
            statement: "Tattoos are now",
            answer: "F",
          },
          {
            number: 3,
            statement: "Famous people help to establish",
            answer: "D",
          },
          {
            number: 4,
            statement: "Throughout the United States, local governments have developed",
            answer: "B",
          },
          {
            number: 5,
            statement:
              "Society's previous attitude towards people with tattoos could be described as",
            answer: "A",
          },
        ],
      },
    ],
  },
]

const PAGES = [
  {
    page: 8,
    unit: 1,
    title: "Human nature",
    label: "Character · 1.1–1.5",
    exercise_ids: ["1.1", "1.2", "1.3", "1.4", "1.5"],
  },
  {
    page: 9,
    unit: 1,
    title: "Human nature",
    label: "Mind map & speaking · 2.1–2.4",
    exercise_ids: ["2.1", "2.2", "2.3", "2.4"],
  },
  {
    page: 10,
    unit: 1,
    title: "Human nature",
    label: "Psychology · reading 3.1–3.2",
    exercise_ids: ["3.1", "3.2"],
  },
  {
    page: 11,
    unit: 1,
    title: "Human nature",
    label: "Test practice · Listening Section 4",
    exercise_ids: ["test_practice"],
  },
  {
    page: 12,
    unit: 2,
    title: "Time for a change",
    label: "Time · 1.1–2.2",
    exercise_ids: ["1.1", "1.2", "1.3", "2.1", "2.2"],
  },
  {
    page: 13,
    unit: 2,
    title: "Time for a change",
    label: "Archaeology & Change · 3.1–4.2",
    exercise_ids: ["3.1", "3.2", "4.1", "4.2"],
  },
  {
    page: 14,
    unit: 2,
    title: "Time for a change",
    label: "Graph & trends · 4.3–4.6",
    exercise_ids: ["4.3", "4.4", "4.5", "4.6"],
  },
  {
    page: 15,
    unit: 2,
    title: "Time for a change",
    label: "Reading · Remnants of the past",
    exercise_ids: ["reading_passage"],
  },
  {
    page: 16,
    unit: 2,
    title: "Time for a change",
    label: "Reading · Questions 1–6",
    exercise_ids: ["reading_1_6"],
  },
  {
    page: 17,
    unit: 2,
    title: "Time for a change",
    label: "Reading · Questions 7–13",
    exercise_ids: ["reading_7_13"],
  },
  {
    page: 18,
    unit: 3,
    title: "No man is an island",
    label: "Individuality · 1.1–2.1",
    exercise_ids: ["1.1", "1.2", "1.3", "1.4", "2.1"],
  },
]

function patch(data) {
  const units = data.units

  // Unit 1 — ensure cynical + well-liked in 1.3 items
  const u1 = units.find((u) => u.unit_number === 1)
  if (u1) {
    const vocab = u1.sections?.find((s) => s.section_type === "vocabulary")
    const ex13 = vocab?.exercises?.find((e) => e.exercise_id === "1.3")
    if (ex13 && Array.isArray(ex13.items)) {
      for (const w of ["cynical", "well-liked"]) {
        if (!ex13.items.includes(w)) ex13.items.push(w)
      }
    }
    if (ex13?.table?.["Positive qualities"] && !ex13.table["Positive qualities"].includes("well-liked")) {
      ex13.table["Positive qualities"].push("well-liked")
    }
  }

  // Unit 2 — append reading if missing
  const u2 = units.find((u) => u.unit_number === 2)
  if (u2) {
    const hasReading = (u2.sections ?? []).some(
      (s) =>
        s.section_type === "reading" ||
        s.exercise_id === "reading_1_6" ||
        (Array.isArray(s.exercises) && s.exercises.some((e) => e.exercise_id === "reading_1_6")),
    )
    if (!hasReading) {
      u2.sections = [...(u2.sections ?? []), UNIT2_READING]
    }
  }

  // Unit 3 — fill sections
  const u3 = units.find((u) => u.unit_number === 3)
  if (u3) {
    u3.sections = UNIT3_SECTIONS
  }

  // Answer keys
  data.answer_key = data.answer_key ?? {}
  data.answer_key.unit_1 = data.answer_key.unit_1 ?? {}
  if (data.answer_key.unit_1["1.3"]?.["Positive qualities"] && !data.answer_key.unit_1["1.3"]["Positive qualities"].includes("well-liked")) {
    data.answer_key.unit_1["1.3"]["Positive qualities"].push("well-liked")
  }

  data.answer_key.unit_2 = data.answer_key.unit_2 ?? {}
  data.answer_key.unit_2.reading_1_6 = ["B", "E", "A", "C", "A", "D"]
  data.answer_key.unit_2.reading_7_13 = [
    "YES",
    "NO",
    "NOT GIVEN",
    "YES",
    "NOT GIVEN",
    "NO",
    "YES",
  ]

  data.answer_key.unit_3 = data.answer_key.unit_3 ?? {}
  data.answer_key.unit_3["1.2"] = ["clothes", "car", "music", "hairstyle"]
  data.answer_key.unit_3["1.3"] = ["blend in with", "fit in with"]
  data.answer_key.unit_3["1.4"] = [
    "join in",
    "stand out (from)/stand out",
    "blend in (with)/blend in",
    "break away (from)/break away",
    "drop out (of)/drop out/opt out (of)/opt out",
    "fit in (with)/fit in/blend in (with)/blend in",
  ]
  data.answer_key.unit_3["2.1"] = ["C", "F", "D", "B", "A"]

  data.pages = PAGES
  return data
}

const raw = JSON.parse(fs.readFileSync(BACKEND, "utf8"))
const next = patch(raw)
const text = `${JSON.stringify(next, null, 2)}\n`
fs.writeFileSync(BACKEND, text)
fs.writeFileSync(FRONT, text)
console.log(`[patch] wrote ${BACKEND}`)
console.log(`[patch] wrote ${FRONT}`)
console.log(
  `[patch] units ready:`,
  next.units.map((u) => `${u.unit_number}:${(u.sections ?? []).length} sections`).join(", "),
)
console.log(`[patch] pages: ${next.pages.length}`)
