const mongoose = require('mongoose');
const bcrypt = require('bcrypt');
const validator = require('validator');
const { v4: uuidv4 } = require('uuid');
const logger = require('../utils/logger'); // Use shared logger

const userSchema = new mongoose.Schema({
    _id: {
        type: String,
        default: uuidv4
    },
    username: {
        type: String,
        required: [true, 'Username is required'],
        unique: true,
        trim: true,
        minlength: [3, 'Username must be at least 3 characters'],
        maxlength: [30, 'Username cannot exceed 30 characters'],
        validate: {
            validator: (v) => /^[a-zA-Z0-9_\-]+$/.test(v),
            message: 'Invalid username format'
        }
    },
    email: {
        type: String,
        required: [true, 'Email is required'],
        unique: true,
        lowercase: true,
        validate: {
            validator: validator.isEmail,
            message: 'Invalid email format'
        }
    },
    password: {
        type: String,
        required: [true, 'Password is required'],
        minlength: [12, 'Password must be at least 12 characters'],
        select: false
    },
    role: {
        type: String,
        enum: ['user', 'admin', 'moderator'],
        default: 'user'
    },
    watchlist: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Anime',
        index: true
    }],
    ratings: [{
        anime: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Anime',
            required: true
        },
        score: {
            type: Number,
            min: 1,
            max: 10,
            required: true
        },
        ratedAt: {
            type: Date,
            default: Date.now
        }
    }],
    reviews: [{
        anime: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Anime',
            required: true
        },
        content: {
            type: String,
            required: true,
            minlength: [50, 'Review must be at least 50 characters'],
            maxlength: [2000, 'Review cannot exceed 2000 characters']
        },
        createdAt: {
            type: Date,
            default: Date.now
        },
        updatedAt: Date
    }],
    lastPasswordChange: Date,
    passwordHistory: [String],
    isVerified: {
        type: Boolean,
        default: false
    },
    loginAttempts: {
        type: Number,
        default: 0
    },
    lockUntil: Date
}, {
    timestamps: true,
    toJSON: {
        virtuals: true,
        transform: (doc, ret) => {
            delete ret.password;
            delete ret.passwordHistory;
            delete ret.loginAttempts;
            delete ret.lockUntil;
            return ret;
        }
    }
});

// Compound indexes
userSchema.index({ email: 1 }, { unique: true });
userSchema.index({ createdAt: -1 });
userSchema.index({ 'ratings.anime': 1, 'ratings.score': 1 });

// Virtual properties
userSchema.virtual('profileUrl').get(function() {
    return `${config.baseUrl}/users/${this.username}`;
});

userSchema.virtual('isLocked').get(function() {
    return this.lockUntil && this.lockUntil > Date.now();
});

// Password validation middleware
userSchema.pre('save', async function(next) {
    if (!this.isModified('password')) return next();
    
    try {
        if (this.passwordHistory.includes(this.password)) {
            throw new Error('Cannot reuse previous passwords');
        }

        const hashed = await bcrypt.hash(this.password, 12);
        this.password = hashed;
        this.passwordHistory.push(hashed);
        this.lastPasswordChange = Date.now();
        
        if (this.passwordHistory.length > 5) {
            this.passwordHistory.shift();
        }
        
        logger.info(`Password updated for user: ${this.username}`);
        next();
    } catch (error) {
        logger.error(`Password update failed: ${error.message}`);
        next(error);
    }
});

// Account locking methods
userSchema.methods.incrementLoginAttempts = async function() {
    if (this.lockUntil && this.lockUntil < Date.now()) {
        return await this.updateOne({
            $set: { loginAttempts: 1 },
            $unset: { lockUntil: 1 }
        });
    }
    
    const updates = { $inc: { loginAttempts: 1 } };
    if (this.loginAttempts + 1 >= 5) {
        updates.$set = { lockUntil: Date.now() + 60 * 60 * 1000 };
    }
    
    return await this.updateOne(updates);
};

userSchema.methods.resetLoginAttempts = async function() {
    return await this.updateOne({
        $set: { loginAttempts: 0 },
        $unset: { lockUntil: 1 }
    });
};

// Password comparison
userSchema.methods.comparePassword = async function(candidate) {
    if (this.isLocked) throw new Error('Account temporarily locked');
    
    try {
        return await bcrypt.compare(candidate, this.password);
    } catch (error) {
        logger.error(`Password comparison failed: ${error.message}`);
        throw error;
    }
};

// Watchlist management
userSchema.statics.manageWatchlist = async function(userId, animeId, action = 'add') {
    const update = action === 'add' 
        ? { $addToSet: { watchlist: animeId } }
        : { $pull: { watchlist: animeId } };

    return this.findByIdAndUpdate(userId, update, {
        new: true,
        select: '-password -passwordHistory'
    }).populate('watchlist', 'title image');
};

// Rating system
userSchema.statics.submitRating = async function(userId, animeId, score) {
    return this.findOneAndUpdate(
        { _id: userId, 'ratings.anime': { $ne: animeId } },
        { $push: { ratings: { anime: animeId, score } } },
        { new: true, select: '-password' }
    ).populate('ratings.anime', 'title');
};

// Review system
userSchema.statics.manageReview = async function(userId, animeId, content) {
    return this.findOneAndUpdate(
        { _id: userId, 'reviews.anime': animeId },
        { 
            $set: { 
                'reviews.$.content': content,
                'reviews.$.updatedAt': Date.now()
            }
        },
        { new: true, select: '-password' }
    ).populate('reviews.anime', 'title');
};

module.exports = mongoose.model('User', userSchema);