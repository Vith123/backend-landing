const express = require("express");
const multer = require("multer");
const path = require("path");
const bcrypt = require("bcryptjs");
const User = require("../models/User");
const Post = require("../models/Post");
const Comment = require("../models/Comment");
const Like = require("../models/Like");
const { auth } = require("../middleware/auth");

const router = express.Router();

const upload = require("../middleware/upload");

// Get user profile
router.get("/:id", async (req, res) => {
  try {
    const user = await User.findById(req.params.id).select("-password").lean();

    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    // Get user's posts with counts
    const posts = await Post.find({ author: req.params.id, published: true })
      .sort({ created_at: -1 })
      .lean();

    const postsWithCounts = await Promise.all(
      posts.map(async (post) => {
        const likes_count = await Like.countDocuments({ post: post._id });
        const comments_count = await Comment.countDocuments({ post: post._id });
        return { ...post, id: post._id, likes_count, comments_count };
      }),
    );

    res.json({ ...user, id: user._id, posts: postsWithCounts });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Server error" });
  }
});

// Update user profile
router.put("/profile", auth, upload.single("avatar"), async (req, res) => {
  try {
    const { username, bio, currentPassword, newPassword } = req.body;
    const userId = req.user.id;

    const user = await User.findById(userId).select("+password");
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    const updates = {};

    if (username && username !== user.username) {
      const existing = await User.findOne({ username, _id: { $ne: userId } });
      if (existing) {
        return res.status(400).json({ error: "Username already taken" });
      }
      updates.username = username;
    }

    if (bio !== undefined) {
      updates.bio = bio;
    }

    if (req.file) {
      updates.avatar = req.file.path || `/uploads/${req.file.filename}`;
    }

    if (newPassword) {
      if (!currentPassword) {
        return res.status(400).json({ error: "Current password is required" });
      }
      const isMatch = await user.comparePassword(currentPassword);
      if (!isMatch) {
        return res.status(400).json({ error: "Current password is incorrect" });
      }
      updates.password = await bcrypt.hash(newPassword, 10);
    }

    if (Object.keys(updates).length > 0) {
      await User.findByIdAndUpdate(userId, updates);
    }

    const updatedUser = await User.findById(userId).select("-password").lean();
    res.json({ ...updatedUser, id: updatedUser._id });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Server error" });
  }
});

// Get user's posts (for dashboard)
router.get("/:id/posts", auth, async (req, res) => {
  try {
    if (req.params.id !== req.user.id) {
      return res.status(403).json({ error: "Not authorized" });
    }

    const posts = await Post.find({ author: req.params.id })
      .sort({ created_at: -1 })
      .lean();

    const postsWithCounts = await Promise.all(
      posts.map(async (post) => {
        const likes_count = await Like.countDocuments({ post: post._id });
        const comments_count = await Comment.countDocuments({ post: post._id });
        return { ...post, id: post._id, likes_count, comments_count };
      }),
    );

    res.json(postsWithCounts);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Server error" });
  }
});

module.exports = router;
