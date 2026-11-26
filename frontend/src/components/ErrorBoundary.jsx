import React from 'react';

export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error('POMS Application Error:', error, errorInfo);
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: null });
    if (this.props.onRetry) {
      this.props.onRetry();
    } else {
      window.location.reload();
    }
  };

  handleReset = () => {
    window.location.href = '/login';
  };

  render() {
    if (this.state.hasError) {
      if (this.props.inline) {
        return (
          <div className="card" style={{
            background: '#fff1f2',
            border: '1px solid #fecdd3',
            borderRadius: '12px',
            padding: '20px',
            textAlign: 'center',
            margin: '12px 0',
          }}>
            <div style={{ color: '#be123c', fontWeight: 600, fontSize: '15px', marginBottom: '8px' }}>
              ⚠️ Unable to display this section
            </div>
            <p style={{ color: '#881337', fontSize: '13px', margin: '0 0 14px' }}>
              {this.state.error?.message || 'A rendering error occurred in this module.'}
            </p>
            <button
              onClick={this.handleRetry}
              className="btn sm"
              style={{ background: '#be123c', color: '#fff', border: 'none', borderRadius: '6px' }}
            >
              Retry Section
            </button>
          </div>
        );
      }

      return (
        <div style={{
          minHeight: '80vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'var(--bg, #f8fafc)',
          color: 'var(--ink, #0f172a)',
          padding: '24px',
        }}>
          <div className="card" style={{
            maxWidth: '520px',
            width: '100%',
            padding: '36px 30px',
            boxShadow: 'var(--elevation-3)',
            textAlign: 'center',
            borderRadius: '16px',
            border: '1px solid var(--line, #e2e8f0)',
          }}>
            <div style={{
              width: '56px',
              height: '56px',
              borderRadius: '50%',
              background: '#fee2e2',
              color: '#dc2626',
              display: 'grid',
              placeItems: 'center',
              fontSize: '26px',
              margin: '0 auto 16px',
            }}>
              ⚠️
            </div>
            <h2 style={{ fontSize: '20px', fontWeight: 700, margin: '0 0 8px', color: '#0f172a' }}>
              {this.props.title || 'Something went wrong'}
            </h2>
            <p style={{ color: '#64748b', fontSize: '14px', lineHeight: '1.6', margin: '0 0 20px' }}>
              An unexpected error occurred while rendering this page. You can try refreshing or resetting your active session.
            </p>
            {this.state.error?.message && (
              <div style={{
                background: '#f8fafc',
                border: '1px solid #e2e8f0',
                color: '#dc2626',
                padding: '10px 14px',
                borderRadius: '8px',
                fontSize: '12.5px',
                fontFamily: 'monospace',
                marginBottom: '24px',
                wordBreak: 'break-word',
                textAlign: 'left',
              }}>
                {this.state.error.message}
              </div>
            )}
            <div style={{ display: 'flex', gap: '12px', justifyContent: 'center' }}>
              <button
                onClick={this.handleRetry}
                className="btn primary"
                style={{
                  padding: '10px 20px',
                  borderRadius: '8px',
                  fontWeight: 600,
                  fontSize: '13.5px',
                }}
              >
                Reload Page
              </button>
              <button
                onClick={this.handleReset}
                className="btn"
                style={{
                  padding: '10px 20px',
                  borderRadius: '8px',
                  fontWeight: 500,
                  fontSize: '13.5px',
                }}
              >
                Sign In Again
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
