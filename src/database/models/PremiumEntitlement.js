const { Schema, model } = require('mongoose');

const premiumEntitlementSchema = new Schema({
  discordUserId: { type: String, required: true, unique: true },
  discordUsername: { type: String, default: null },
  enabled: { type: Boolean, default: true },
  until: { type: Date, default: null },
  note: { type: String, default: null },
  paymentLink: { type: String, default: null },
  source: { type: String, enum: ['PAYPAL', 'ADMIN'], default: 'PAYPAL' },
  lastPaymentId: { type: String, default: null },
  activatedAt: { type: Date, default: Date.now },
  updatedBy: { type: String, default: null }
}, {
  timestamps: true,
  versionKey: false
});

module.exports = model('PremiumEntitlement', premiumEntitlementSchema);