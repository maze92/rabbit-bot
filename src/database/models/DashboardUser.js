// src/database/models/DashboardUser.js

const { Schema, model } = require('mongoose');

const dashboardUserSchema = new Schema(
  {
    username: {
      type: String,
      required: true,
      unique: true,
      trim: true
    },

    passwordHash: {
      type: String,
      required: true
    },

    role: {
      type: String,
      enum: ['ADMIN', 'MOD'],
      default: 'MOD'
    },

    // Basic permission flags so that admins can fine-tune what mods can do.
    permissions: {
      canViewLogs: { type: Boolean, default: true },
      canActOnCases: { type: Boolean, default: true },
      canManageTickets: { type: Boolean, default: true },
      canManageGameNews: { type: Boolean, default: false },
      canViewConfig: { type: Boolean, default: false },
      canEditConfig: { type: Boolean, default: false },
      canManageUsers: { type: Boolean, default: false }
    }
  },
  {
    timestamps: true
  }
);


module.exports = model('DashboardUser', dashboardUserSchema);
