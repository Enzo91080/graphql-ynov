// Import des modules nécessaires
const express = require('express'); // Framework web pour créer le serveur HTTP
const { graphqlHTTP } = require('express-graphql'); // Middleware pour GraphQL
const { buildSchema } = require('graphql'); // Pour définir le schéma GraphQL
const mongoose = require('mongoose'); // Pour interagir avec MongoDB
const bodyParser = require('body-parser'); // Middleware pour analyser les requêtes HTTP
require('dotenv').config(); // Chargement des variables d'environnement depuis le fichier .env

// Connexion à la base de données MongoDB via Mongoose
mongoose.connect(process.env.MONGODB_URI, {
  useNewUrlParser: true, // Utilisation du nouvel analyseur d'URL
  useUnifiedTopology: true, // Meilleure gestion des connexions
});

// Gestionnaire d'événements pour vérifier la connexion à MongoDB
const db = mongoose.connection;
db.on('error', console.error.bind(console, 'Erreur de connexion à MongoDB:')); // Affiche une erreur en cas de problème
db.once('open', () => console.log('Connexion à MongoDB réussie !')); // Affiche un message si la connexion est établie

// Définition des modèles Mongoose
// Modèle pour les utilisateurs
const User = mongoose.model('User', new mongoose.Schema({
  name: String,
  email: String,
  followers: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }], // Référence aux utilisateurs qui suivent cet utilisateur
  following: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }], // Référence aux utilisateurs suivis par cet utilisateur
}));

// Modèle pour les posts
const Post = mongoose.model('Post', new mongoose.Schema({
  title: String,
  content: String,
  imageUrl: String,
  author: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }, // Référence à l'auteur du post
  likes: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }], // Liste des utilisateurs ayant aimé le post
  comments: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Comment' }], // Liste des commentaires associés au post
}));

// Modèle pour les commentaires
const Comment = mongoose.model('Comment', new mongoose.Schema({
  content: String,
  author: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }, // Référence à l'auteur du commentaire
  post: { type: mongoose.Schema.Types.ObjectId, ref: 'Post' }, // Référence au post associé
}));

// Définition du schéma GraphQL
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

// Résolveurs GraphQL pour gérer les requêtes et mutations
const root = {
  user: async ({ id }) => {
    // Récupère un utilisateur par son ID avec les informations de followers et following
    const user = await User.findById(id).populate('followers following');
    user.posts = await Post.find({ author: id }); // Récupère les posts écrits par l'utilisateur
    return user;
  },

  users: async () => {
    // Récupère tous les utilisateurs avec leurs relations
    return User.find().populate('followers following');
  },

  post: async ({ id }) => {
    // Récupère un post par son ID avec ses relations (auteur, likes, commentaires)
    return Post.findById(id)
      .populate('author likes comments')
      .populate({
        path: 'comments',
        populate: { path: 'author' }, // Récupère l'auteur des commentaires
      });
  },

  posts: async () => {
    // Récupère tous les posts avec leurs relations
    return Post.find()
      .populate('author likes comments')
      .populate({
        path: 'comments',
        populate: { path: 'author' },
      });
  },

  addUser: async ({ name, email }) => {
    // Ajoute un nouvel utilisateur
    const user = new User({ name, email });
    return user.save();
  },

  addPost: async ({ title, content, imageUrl, authorId }) => {
    // Ajoute un nouveau post
    const post = new Post({ title, content, imageUrl, author: authorId });
    return post.save();
  },

  likePost: async ({ postId, userId }) => {
    // Ajoute un utilisateur à la liste des likes d'un post
    const post = await Post.findById(postId);
    if (!post.likes.includes(userId)) {
      post.likes.push(userId);
      await post.save();
    }
    return post.populate('author likes comments');
  },

  addComment: async ({ postId, content, authorId }) => {
    // Ajoute un commentaire à un post
    const comment = new Comment({ content, author: authorId, post: postId });
    await comment.save();

    const post = await Post.findById(postId);
    post.comments.push(comment._id);
    await post.save();

    return comment.populate('author post');
  },

  followUser: async ({ followerId, followingId }) => {
    // Permet à un utilisateur de suivre un autre utilisateur
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

// Création de l'application Express
const app = express();

// Middleware pour analyser les requêtes en JSON
app.use(bodyParser.json());

// Middleware pour logger les requêtes GraphQL
app.use('/graphql', (req, res, next) => {
  console.log('--- Requête GraphQL reçue ---');
  console.log(`Query: ${req.body?.query}`);
  console.log(`Variables: ${JSON.stringify(req.body?.variables)}`);
  console.log('--------------------------------');
  next();
});

// Route GraphQL
app.use('/graphql', graphqlHTTP({
  schema: schema, // Schéma GraphQL défini
  rootValue: root, // Résolveurs définis
  graphiql: true, // Interface graphiql activée pour tester les requêtes
}));

// Lancement du serveur sur le port 4000
app.listen(4000, () => console.log('Serveur GraphQL lancé sur http://localhost:4000/graphql'));
