const express = require('express');
const Category = require('../models/Category');
const Post = require('../models/Post');
const { auth, adminOnly } = require('../middleware/auth');

const router = express.Router();

// Get all categories with product counts
router.get('/', async (req, res) => {
  try {
    const categories = await Category.find({ active: true })
      .sort({ order: 1, name: 1 })
      .lean();

    // Get product count for each category
    const categoriesWithCounts = await Promise.all(
      categories.map(async (cat) => {
        const count = await Post.countDocuments({ 
          category: cat.slug, 
          published: true 
        });
        return {
          ...cat,
          id: cat._id,
          count
        };
      })
    );

    res.json({ categories: categoriesWithCounts });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Get single category by slug
router.get('/:slug', async (req, res) => {
  try {
    const category = await Category.findOne({ 
      slug: req.params.slug, 
      active: true 
    }).lean();

    if (!category) {
      return res.status(404).json({ error: 'Category not found' });
    }

    const count = await Post.countDocuments({ 
      category: category.slug, 
      published: true 
    });

    res.json({ 
      category: { ...category, id: category._id, count } 
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Create category (Admin only)
router.post('/', auth, adminOnly, async (req, res) => {
  try {
    const { name, description, icon, gradient, order } = req.body;

    const category = new Category({
      name,
      slug: name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, ''),
      description,
      icon,
      gradient,
      order
    });

    await category.save();

    res.status(201).json({ 
      message: 'Category created successfully', 
      category: { ...category.toObject(), id: category._id } 
    });
  } catch (error) {
    console.error(error);
    if (error.code === 11000) {
      return res.status(400).json({ error: 'Category already exists' });
    }
    res.status(500).json({ error: 'Server error' });
  }
});

// Update category (Admin only)
router.put('/:id', auth, adminOnly, async (req, res) => {
  try {
    const { name, description, icon, gradient, order, active } = req.body;

    const category = await Category.findById(req.params.id);
    if (!category) {
      return res.status(404).json({ error: 'Category not found' });
    }

    if (name) {
      category.name = name;
      category.slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
    }
    if (description !== undefined) category.description = description;
    if (icon) category.icon = icon;
    if (gradient) category.gradient = gradient;
    if (order !== undefined) category.order = order;
    if (active !== undefined) category.active = active;

    await category.save();

    res.json({ 
      message: 'Category updated successfully', 
      category: { ...category.toObject(), id: category._id } 
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Delete category (Admin only)
router.delete('/:id', auth, adminOnly, async (req, res) => {
  try {
    const category = await Category.findByIdAndDelete(req.params.id);
    if (!category) {
      return res.status(404).json({ error: 'Category not found' });
    }

    res.json({ message: 'Category deleted successfully' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Seed default categories (Admin only)
router.post('/seed', auth, adminOnly, async (req, res) => {
  try {
    const defaultCategories = [
      { 
        name: 'Keyboards', 
        slug: 'keyboards',
        icon: 'M6 2H18C19.1046 2 20 2.89543 20 4V8C20 9.10457 19.1046 10 18 10H6C4.89543 10 4 9.10457 4 8V4C4 2.89543 4.89543 2 6 2ZM6 4V8H18V4H6ZM2 14H6V18H2V14ZM8 14H12V18H8V14ZM14 14H22V18H14V14Z',
        gradient: 'from-purple-600 to-indigo-600',
        order: 1
      },
      { 
        name: 'Gaming Mice', 
        slug: 'mice',
        icon: 'M12 14L12 8M8 6C8 3.79086 9.79086 2 12 2C14.2091 2 16 3.79086 16 6V14C16 16.2091 14.2091 18 12 18C9.79086 18 8 16.2091 8 14V6ZM12 18V22M8 22H16',
        gradient: 'from-cyan-500 to-blue-600',
        order: 2
      },
      { 
        name: 'Headsets', 
        slug: 'headsets',
        icon: 'M9 19V21M15 19V21M5 17V11C5 7.13401 8.13401 4 12 4C15.866 4 19 7.13401 19 11V17M5 14V17H7V14H5ZM17 14V17H19V14H17Z',
        gradient: 'from-pink-500 to-rose-600',
        order: 3
      },
      { 
        name: 'Controllers', 
        slug: 'controllers',
        icon: 'M6 9L6 11M9 8L9 10M21 12C21 16.9706 16.9706 21 12 21C7.02944 21 3 16.9706 3 12C3 7.02944 7.02944 3 12 3C16.9706 3 21 7.02944 21 12ZM15 9.5H17M16 8.5V10.5M15 13H17M9 13H11',
        gradient: 'from-orange-500 to-red-600',
        order: 4
      },
      { 
        name: 'Accessories', 
        slug: 'accessories',
        icon: 'M12 2L2 7L12 12L22 7L12 2ZM2 17L12 22L22 17M2 12L12 17L22 12',
        gradient: 'from-green-500 to-teal-600',
        order: 5
      }
    ];

    // Insert only if they don't exist
    for (const cat of defaultCategories) {
      await Category.findOneAndUpdate(
        { slug: cat.slug },
        cat,
        { upsert: true, new: true }
      );
    }

    const categories = await Category.find({ active: true }).sort({ order: 1 });
    res.json({ 
      message: 'Categories seeded successfully', 
      categories 
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
