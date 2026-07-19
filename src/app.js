import express from 'express';  
import cors from 'cors';
import routes from './routes/index.js';
import errorHandler from './middlewares/errorHandler.js';

const app = express();

// Standard Middlewares
app.use(cors());
app.use(express.json());

// API Routes
app.use('/api', routes);

// Error Handling Middleware
app.use(errorHandler);

export default app;
