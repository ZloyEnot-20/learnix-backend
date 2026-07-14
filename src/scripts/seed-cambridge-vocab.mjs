/**
 * Seed Cambridge unit vocab decks only (requires Mongo).
 * Usage: node src/scripts/seed-cambridge-vocab.mjs
 */
import { setServers } from "node:dns"
import { connectDB, disconnectDB } from "../config/db.js"
import mongoose from "../config/mongoose.js"
import { VocabDeck } from "../models/VocabDeck.js"
import { CAMBRIDGE_UNIT_VOCAB_DECKS } from "../content/cambridge-unit-vocab-decks.js"

setServers(["8.8.8.8", "8.8.4.4", "1.1.1.1"])

async function main() {
  await connectDB()
  for (const deck of CAMBRIDGE_UNIT_VOCAB_DECKS) {
    await VocabDeck.updateOne(
      { _id: deck.slug },
      { $set: { ...deck, orgId: null } },
      { upsert: true },
    )
  }
  console.log(`[seed:cambridge-vocab] ensured ${CAMBRIDGE_UNIT_VOCAB_DECKS.length} decks`)
}

main()
  .then(async () => {
    await disconnectDB()
    process.exit(0)
  })
  .catch(async (err) => {
    console.error("[seed:cambridge-vocab] failed:", err?.message || err)
    await mongoose.disconnect().catch(() => {})
    process.exit(1)
  })
