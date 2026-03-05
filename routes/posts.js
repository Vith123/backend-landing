const express = require("express");
const Post = require("../models/Post");
const Comment = require("../models/Comment");
const Like = require("../models/Like");
const { auth, adminOnly, optionalAuth } = require("../middleware/auth");

const upload = require("../middleware/upload");

const router = express.Router();

// Get all posts
router.get("/", optionalAuth, async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;
    const category = req.query.category;
    const search = req.query.search;
    const sort = req.query.sort || "newest";

    // Build filter query
    const filter = { published: true };
    if (category && category !== "all") {
      filter.category = category;
    }
    if (search) {
      filter.$or = [
        { title: { $regex: search, $options: "i" } },
        { content: { $regex: search, $options: "i" } },
        { excerpt: { $regex: search, $options: "i" } },
      ];
    }

    // Build sort query
    let sortQuery = { createdAt: -1 };
    switch (sort) {
      case "oldest":
        sortQuery = { createdAt: 1 };
        break;
      case "price-low":
        sortQuery = { price: 1 };
        break;
      case "price-high":
        sortQuery = { price: -1 };
        break;
      case "popular":
        sortQuery = { likes: -1 };
        break;
      default:
        sortQuery = { createdAt: -1 };
    }

    const posts = await Post.find(filter)
      .populate("author", "username avatar")
      .sort(sortQuery)
      .skip(skip)
      .limit(limit)
      .lean();

    // Get likes and comments count for each post
    const postsWithCounts = await Promise.all(
      posts.map(async (post) => {
        const likes_count = await Like.countDocuments({ post: post._id });
        const comments_count = await Comment.countDocuments({ post: post._id });
        return {
          ...post,
          id: post._id,
          author_name: post.author?.username,
          author_avatar: post.author?.avatar,
          likes_count,
          comments_count,
        };
      }),
    );

    const total = await Post.countDocuments(filter);

    res.json({
      posts: postsWithCounts,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
      filters: {
        category: category || "all",
        search: search || "",
        sort,
      },
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Server error" });
  }
});

// Get single post
router.get("/:id", optionalAuth, async (req, res) => {
  try {
    const post = await Post.findById(req.params.id)
      .populate("author", "username avatar bio")
      .lean();

    if (!post) {
      return res.status(404).json({ error: "Post not found" });
    }

    const likes_count = await Like.countDocuments({ post: post._id });

    // Check if current user liked this post
    let liked = false;
    if (req.user) {
      const userLike = await Like.findOne({
        post: post._id,
        user: req.user.id,
      });
      liked = !!userLike;
    }

    // Get comments
    const comments = await Comment.find({ post: req.params.id })
      .populate("user", "username avatar")
      .sort({ created_at: -1 })
      .lean();

    const formattedComments = comments.map((c) => ({
      ...c,
      id: c._id,
      username: c.user?.username,
      avatar: c.user?.avatar,
    }));

    res.json({
      ...post,
      id: post._id,
      author_name: post.author?.username,
      author_avatar: post.author?.avatar,
      author_bio: post.author?.bio,
      likes_count,
      liked,
      comments: formattedComments,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Server error" });
  }
});

// Create post (Admin only)
router.post(
  "/",
  auth,
  adminOnly,
  (req, res, next) => {
    upload.single("cover_image")(req, res, (err) => {
      if (err) {
        console.error("Upload Error:", err);
        return res
          .status(500)
          .json({ error: "Image upload failed: " + err.message });
      }
      next();
    });
  },
  async (req, res) => {
    try {
      const { title, content, excerpt, price, category } = req.body;

      if (!title || !content) {
        return res
          .status(400)
          .json({ error: "Title and content are required" });
      }

      // Handle both Cloudinary (path) and local uploads (filename)
      let cover_image = null;
      if (req.file) {
        cover_image = req.file.path || `/uploads/${req.file.filename}`;
      }
      const postExcerpt =
        excerpt || content.replace(/<[^>]*>/g, "").substring(0, 150) + "...";

      const post = await Post.create({
        title,
        content,
        excerpt: postExcerpt,
        cover_image,
        price: price || 0,
        category: category || "other",
        author: req.user.id,
      });

      res.status(201).json(post);
    } catch (error) {
      console.error("Create Post Error:", error);
      res.status(500).json({ error: "Server error: " + error.message });
    }
  },
);

// Update post (Admin only)
router.put(
  "/:id",
  auth,
  adminOnly,
  (req, res, next) => {
    upload.single("cover_image")(req, res, (err) => {
      if (err) {
        console.error("Upload Error:", err);
        return res
          .status(500)
          .json({ error: "Image upload failed: " + err.message });
      }
      next();
    });
  },
  async (req, res) => {
    try {
      const post = await Post.findById(req.params.id);

      if (!post) {
        return res.status(404).json({ error: "Post not found" });
      }

      const { title, content, excerpt, published, price, category } = req.body;

      // Handle both Cloudinary (path) and local uploads (filename)
      let cover_image = post.cover_image;
      if (req.file) {
        cover_image = req.file.path || `/uploads/${req.file.filename}`;
      }

      const updatedPost = await Post.findByIdAndUpdate(
        req.params.id,
        {
          title: title || post.title,
          content: content || post.content,
          excerpt: excerpt || post.excerpt,
          cover_image,
          published: published !== undefined ? published : post.published,
          price: price !== undefined ? price : post.price,
          category: category || post.category,
          updatedAt: Date.now(),
        },
        { new: true },
      );

      res.json(updatedPost);
    } catch (error) {
      console.error("Update Post Error:", error);
      res.status(500).json({ error: "Server error: " + error.message });
    }
  },
);

// Delete post (Admin only)
router.delete("/:id", auth, adminOnly, async (req, res) => {
  try {
    const post = await Post.findById(req.params.id);

    if (!post) {
      return res.status(404).json({ error: "Post not found" });
    }

    if (post.author.toString() !== req.user.id) {
      return res.status(403).json({ error: "Not authorized" });
    }

    await Post.findByIdAndDelete(req.params.id);
    await Comment.deleteMany({ post: req.params.id });
    await Like.deleteMany({ post: req.params.id });

    res.json({ message: "Post deleted successfully" });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Server error" });
  }
});

// Like/Unlike post
router.post("/:id/like", auth, async (req, res) => {
  try {
    const postId = req.params.id;
    const userId = req.user.id;

    const existingLike = await Like.findOne({ post: postId, user: userId });

    if (existingLike) {
      await Like.findByIdAndDelete(existingLike._id);
      res.json({ liked: false });
    } else {
      await Like.create({ post: postId, user: userId });
      res.json({ liked: true });
    }
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Server error" });
  }
});

// Add comment
router.post("/:id/comments", auth, async (req, res) => {
  try {
    const { content, rating } = req.body;

    if (!content) {
      return res.status(400).json({ error: "Content is required" });
    }

    const comment = await Comment.create({
      content,
      rating: rating || null,
      post: req.params.id,
      user: req.user.id,
    });

    const populatedComment = await Comment.findById(comment._id)
      .populate("user", "username avatar")
      .lean();

    res.status(201).json({
      ...populatedComment,
      id: populatedComment._id,
      username: populatedComment.user?.username,
      avatar: populatedComment.user?.avatar,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Server error" });
  }
});

// Delete comment
router.delete("/:postId/comments/:commentId", auth, async (req, res) => {
  try {
    const comment = await Comment.findById(req.params.commentId);

    if (!comment) {
      return res.status(404).json({ error: "Comment not found" });
    }

    if (comment.user.toString() !== req.user.id) {
      return res.status(403).json({ error: "Not authorized" });
    }

    await Comment.findByIdAndDelete(req.params.commentId);
    res.json({ message: "Comment deleted successfully" });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Server error" });
  }
});

module.exports = router;
