import { Component } from 'react';

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error, info) {
    console.error('Application error:', error, info);
  }

  handleReset = () => {
    this.setState({ hasError: false });
  };

  render() {
    if (this.state.hasError) {
      return (
        <main className="app-main" id="main-content" tabIndex="-1">
          <section className="error-state" role="alert">
            <h1 className="error-state__title">Something went wrong</h1>
            <p className="error-state__message">The application encountered an unexpected error.</p>
            <button className="button button--primary" type="button" onClick={this.handleReset}>Try again</button>
          </section>
        </main>
      );
    }

    return this.props.children;
  }
}
