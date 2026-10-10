import { useCallback, useState } from 'react';
import { apiFetch, readApiData } from '../services/api';
import { useApiData } from '../hooks/useApiData';
import { ErrorState, SkeletonPage } from '../components/AsyncState';
import './faq.css';

export default function FaqPage() {
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('');

  const loadFaq = useCallback(async () => {
    const params = new URLSearchParams();
    if (search) params.set('search', search);
    if (category) params.set('category', category);
    const [articlesRes, categoriesRes] = await Promise.all([
      apiFetch(`/faq?${params.toString()}`, {}),
      apiFetch('/faq/categories', {}),
    ]);
    return {
      articles: await readApiData(articlesRes),
      categories: await readApiData(categoriesRes),
    };
  }, [search, category]);

  const { data, loading, error, reload } = useApiData(loadFaq);
  const articles = data?.articles?.data || [];
  const categories = data?.categories?.data || [];

  if (loading && !data) return <SkeletonPage label="Loading help articles..." />;
  if (error && !data) return <ErrorState message={error} onRetry={reload} />;

  return (
    <div className="page" aria-busy={loading}>
      <header className="page-header">
        <div>
          <h1 className="page-title">Help &amp; FAQ</h1>
          <p className="page-subtitle">Find answers to common questions about the maintenance calendar</p>
        </div>
      </header>

      <div className="filters" aria-label="Article filters">
        <div className="filter-group filter-group--search">
          <label className="sr-only" htmlFor="faq-search">Search articles</label>
          <input
            className="input"
            id="faq-search"
            type="search"
            placeholder="Search help articles..."
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </div>
        <div className="filter-group">
          <label className="sr-only" htmlFor="faq-category">Category</label>
          <select className="input" id="faq-category" value={category} onChange={(event) => setCategory(event.target.value)}>
            <option value="">All categories</option>
            {categories.map((cat) => <option key={cat} value={cat}>{cat}</option>)}
          </select>
        </div>
      </div>

      {articles.length === 0 ? (
        <div className="empty-state">
          <p>No help articles found{search || category ? ' matching your search' : ''}.</p>
        </div>
      ) : (
        <div className="faq-list">
          {articles.map((article) => (
            <article className="faq-card" key={article.id}>
              {article.category && <span className="badge badge--neutral">{article.category}</span>}
              <h2 className="faq-card__title">{article.title}</h2>
              <div className="faq-card__body">{article.body}</div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}