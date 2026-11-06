import { db } from '@/lib/db';
import { createReviewsRepository } from './repository.js';
import { createReviewsService } from './service.js';

export const reviewsService = createReviewsService({ repository: createReviewsRepository(db) });
