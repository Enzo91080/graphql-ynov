const express = require('express');
const { graphqlHTTP } = require('express-graphql');
const { buildSchema } = require('graphql');
const mongoose = require('mongoose');
const bodyParser = require('body-parser');
require('dotenv').config();

// Connexion à MongoDB
mongoose.connect(process.env.MONGODB_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
});

const db = mongoose.connection;
db.on('error', console.error.bind(console, 'Erreur de connexion à MongoDB:'));
db.once('open', () => console.log('Connexion à MongoDB réussie !'));

// Modèles Mongoose
const User = mongoose.model('User', new mongoose.Schema({
  name: String,
  email: String,
  followers: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  following: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
}));

const Post = mongoose.model('Post', new mongoose.Schema({
  title: String,
  content: String,
  imageUrl: String,
  author: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  likes: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  comments: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Comment' }],
}));

const Comment = mongoose.model('Comment', new mongoose.Schema({
  content: String,
  author: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  post: { type: mongoose.Schema.Types.ObjectId, ref: 'Post' },
}));

// Schéma GraphQL
const schema = buildSchema(`
  type Query {
    user(id: ID!): User
    users: [User]
    post(id: ID!): Post
    posts: [Post]
  }

  type Mutation {
    addUser(name: String!, email: String!): User
    addPost(title: String!, content: String!, imageUrl: String, authorId: ID!): Post
    likePost(postId: ID!, userId: ID!): Post
    addComment(postId: ID!, content: String!, authorId: ID!): Comment
    followUser(followerId: ID!, followingId: ID!): User
  }

  type User {
    id: ID!
    name: String
    email: String
    posts: [Post]
    followers: [User]
    following: [User]
  }

  type Post {
    id: ID!
    title: String
    content: String
    imageUrl: String
    author: User
    likes: [User]
    comments: [Comment]
  }

  type Comment {
    id: ID!
    content: String
    author: User
    post: Post
  }
`);

// Résolveurs
const root = {
  user: async ({ id }) => {
    const user = await User.findById(id).populate('followers following');
    user.posts = await Post.find({ author: id });
    return user;
  },

  users: async () => {
    return User.find().populate('followers following');
  },

  post: async ({ id }) => {
    return Post.findById(id)
      .populate('author likes comments')
      .populate({
        path: 'comments',
        populate: { path: 'author' },
      });
  },

  posts: async () => {
    return Post.find()
      .populate('author likes comments')
      .populate({
        path: 'comments',
        populate: { path: 'author' },
      });
  },

  addUser: async ({ name, email }) => {
    const user = new User({ name, email });
    return user.save();
  },

  addPost: async ({ title, content, imageUrl, authorId }) => {
    const post = new Post({ title, content, imageUrl, author: authorId });
    return post.save();
  },

  likePost: async ({ postId, userId }) => {
    const post = await Post.findById(postId);
    if (!post.likes.includes(userId)) {
      post.likes.push(userId);
      await post.save();
    }
    return post.populate('author likes comments');
  },

  addComment: async ({ postId, content, authorId }) => {
    const comment = new Comment({ content, author: authorId, post: postId });
    await comment.save();

    const post = await Post.findById(postId);
    post.comments.push(comment._id);
    await post.save();

    return comment.populate('author post');
  },

  followUser: async ({ followerId, followingId }) => {
    const follower = await User.findById(followerId);
    const following = await User.findById(followingId);

    if (!follower.following.includes(followingId)) {
      follower.following.push(followingId);
      await follower.save();
    }

    if (!following.followers.includes(followerId)) {
      following.followers.push(followerId);
      await following.save();
    }

    return follower.populate('following');
  },
};

const app = express();

app.use(bodyParser.json());

app.use('/graphql', (req, res, next) => {
  console.log('--- Requête GraphQL reçue ---');
  console.log(`Query: ${req.body?.query}`);
  console.log(`Variables: ${JSON.stringify(req.body?.variables)}`);
  console.log('--------------------------------');
  next();
});

// Serveur Express
app.use('/graphql', graphqlHTTP({
  schema: schema,
  rootValue: root,
  graphiql: true,
}));

// Lancement du serveur
app.listen(4000, () => console.log('Serveur GraphQL lancé sur http://localhost:4000/graphql'));
