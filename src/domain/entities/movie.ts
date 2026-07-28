import { resolveMovieLanguage, resolveMovieQuality } from '../../shared/movies/filters.js';

export type Movie = {
  id: string;
  detailUrl: string;
  sourceSqliteId: number | null;
  listTitle: string | null;
  listPosterUrl: string | null;
  pageTitle: string | null;
  movieName: string | null;
  year: number | null;
  movieQuality: string | null;
  imageUrl: string | null;
  directedBy: string[];
  writtenBy: string[];
  starring: string[];
  genres: string[];
  categories: string[];
  tags: string[];
  country: string | null;
  language: string | null;
  description: string | null;
  createdAt: string | null;
  updatedAt: string | null;
  fetchedAt: string | null;
  syncedAt: string | null;
};

/** Slim list/search card — only fields the app list needs. */
export type MovieCard = {
  id: string;
  movieName: string | null;
  listTitle: string | null;
  year: number | null;
  quality: string | null;
  poster: string | null;
  language: string | null;
  createdAt: string | null;
  updatedAt: string | null;
};

export function toMovieCard(movie: Movie): MovieCard {
  return {
    id: movie.id,
    movieName: movie.movieName,
    listTitle: movie.listTitle,
    year: movie.year,
    quality: resolveMovieQuality(movie.movieQuality, movie.listTitle, movie.pageTitle),
    poster: movie.listPosterUrl ?? movie.imageUrl,
    language: resolveMovieLanguage(movie.language, movie.listTitle, movie.pageTitle),
    createdAt: movie.createdAt,
    updatedAt: movie.updatedAt,
  };
}

export type MovieSearchScope =
  | 'title'
  | 'all'
  | 'actor'
  | 'director'
  | 'writer'
  | 'cast'
  | 'keyword';

export type MovieSort =
  | 'newest'
  | 'oldest'
  | 'year_desc'
  | 'year_asc'
  | 'az'
  | 'za';

export type MovieListQuery = {
  q?: string;
  scope?: MovieSearchScope;
  sort?: MovieSort;
  language?: string;
  year?: number;
  quality?: string;
  genre?: string;
  category?: string;
  country?: string;
  page: number;
  limit: number;
};

export type MovieListResult = {
  items: Movie[];
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  hasNext: boolean;
  hasPrev: boolean;
};

export type MovieTorrent = {
  id: number;
  detailUrl: string;
  quality: string | null;
  sizeLabel: string | null;
  magnetUri: string;
  sortOrder: number;
};
