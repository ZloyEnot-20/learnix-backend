import mongoose from "mongoose"

/**
 * Global Mongoose setup. Imported FIRST (before any model) in both entry points
 * (app.js and seed.js) so the toJSON transform is registered before schemas are
 * compiled.
 *
 * The transform exposes a clean `id` field (mirroring the frontend types) and
 * strips `_id`/`__v` from every JSON response.
 */
mongoose.set("strictQuery", true)

mongoose.plugin((schema) => {
  schema.set("toJSON", {
    versionKey: false,
    transform(_doc, ret) {
      if (ret._id !== undefined) {
        ret.id = ret._id
        delete ret._id
      }
      return ret
    },
  })
})

export default mongoose
