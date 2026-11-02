import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';

const { Schema, model } = mongoose;

export const PRIORITIES = ['normal', 'senior', 'accessibility', 'emergency'];
// Lower rank is served first.
export const PRIORITY_RANK = { emergency: 0, accessibility: 1, senior: 1, normal: 2 };
export const ACTIVE_STATUSES = ['waiting', 'called', 'serving'];
export const QUEUE_SORT = { priorityRank: 1, createdAt: 1, seq: 1 };

const userSchema = new Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 80 },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    passwordHash: { type: String, required: true, select: false },
    role: { type: String, enum: ['admin', 'staff'], default: 'staff' },
    service: { type: Schema.Types.ObjectId, ref: 'Service', default: null },
    active: { type: Boolean, default: true },
  },
  { timestamps: true }
);
userSchema.methods.verifyPassword = function (pw) {
  return bcrypt.compare(pw, this.passwordHash);
};
userSchema.statics.hashPassword = (pw) => bcrypt.hash(pw, 10);
userSchema.set('toJSON', {
  transform: (_doc, ret) => {
    delete ret.passwordHash;
    delete ret.__v;
    return ret;
  },
});

const serviceSchema = new Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 80 },
    code: {
      type: String,
      required: true,
      uppercase: true,
      trim: true,
      match: [/^[A-Z0-9]{1,3}$/, 'Code must be 1-3 letters or digits'],
    },
    category: {
      type: String,
      enum: ['hospital', 'bank', 'government', 'service_center', 'other'],
      default: 'other',
    },
    address: { type: String, trim: true, maxlength: 160, default: '' },
    avgServiceMinutes: { type: Number, default: 8, min: 1, max: 240 },
    capacity: { type: Number, default: 50, min: 1, max: 10000 },
    noShowSeconds: { type: Number, default: 120, min: 15, max: 3600 },
    tokenExpiryMinutes: { type: Number, default: 240, min: 10, max: 1440 },
    active: { type: Boolean, default: true },
  },
  { timestamps: true }
);

const counterSchema = new Schema(
  {
    service: { type: Schema.Types.ObjectId, ref: 'Service', required: true, index: true },
    name: { type: String, required: true, trim: true, maxlength: 40 },
    status: { type: String, enum: ['open', 'closed', 'break'], default: 'closed' },
    currentToken: { type: Schema.Types.ObjectId, ref: 'Token', default: null },
  },
  { timestamps: true }
);

const tokenSchema = new Schema(
  {
    service: { type: Schema.Types.ObjectId, ref: 'Service', required: true },
    counter: { type: Schema.Types.ObjectId, ref: 'Counter', default: null },
    assignedCounter: { type: Schema.Types.ObjectId, ref: 'Counter', default: null },
    seq: { type: Number, required: true },
    label: { type: String, required: true },
    code: { type: String, required: true, unique: true },
    dateKey: { type: String, required: true },
    hour: { type: Number, default: 0 },
    waitSeconds: { type: Number, default: 0 },
    name: { type: String, required: true, trim: true, maxlength: 60 },
    phone: { type: String, default: '' },
    priority: { type: String, enum: PRIORITIES, default: 'normal' },
    priorityRank: { type: Number, default: 2 },
    status: {
      type: String,
      enum: ['waiting', 'called', 'serving', 'completed', 'no_show', 'expired', 'cancelled'],
      default: 'waiting',
    },
    source: { type: String, enum: ['remote', 'walk_in'], default: 'remote' },
    firstCalledAt: { type: Date, default: null },
    calledAt: { type: Date, default: null },
    startedAt: { type: Date, default: null },
    completedAt: { type: Date, default: null },
    serviceSeconds: { type: Number, default: 0 },
    recallCount: { type: Number, default: 0 },
    checkedIn: { type: Boolean, default: false },
    checkedInAt: { type: Date, default: null },
  },
  { timestamps: true }
);
tokenSchema.index({ service: 1, status: 1, priorityRank: 1, createdAt: 1 });
tokenSchema.index({ service: 1, dateKey: 1 });

const crowdEventSchema = new Schema({
  service: { type: Schema.Types.ObjectId, ref: 'Service', required: true },
  token: { type: Schema.Types.ObjectId, ref: 'Token' },
  type: { type: String, enum: ['check_in', 'check_out'], required: true },
  at: { type: Date, default: Date.now },
});
crowdEventSchema.index({ service: 1, at: -1 });

const sequenceSchema = new Schema({
  key: { type: String, required: true, unique: true },
  value: { type: Number, default: 0 },
});

export const User = model('User', userSchema);
export const Service = model('Service', serviceSchema);
export const Counter = model('Counter', counterSchema);
export const Token = model('Token', tokenSchema);
export const CrowdEvent = model('CrowdEvent', crowdEventSchema);
export const Sequence = model('Sequence', sequenceSchema);
