import { Link } from 'react-router-dom';
import { useAuth } from '../auth.jsx';
import Icon from '../components/Icon.jsx';

const workflow = [
  { icon: 'catalogue', title: 'Build the order', body: 'Find products and suppliers, choose sizes and quantities, and review pricing before submission.' },
  { icon: 'approvals', title: 'Review and approve', body: 'Keep purchasing decisions organized with approval queues and a recorded history of changes.' },
  { icon: 'receipts', title: 'Receive and reconcile', body: 'Follow deliveries, record goods received, and reconcile quantities against your purchase orders.' },
];
export default function Landing() {
  const { user } = useAuth();
  return <div className="portal-page">
    <header className="portal-nav">
      <Link to="/landing" className="portal-brand"><img src="/bsc-logo.png" alt="" /><span>BSC Exclusive<small>Purchase management</small></span></Link>
      <nav aria-label="About the workspace"><a href="#workflow">Workflow</a><a href="#features">Workspace</a></nav>
      <Link className="btn primary" to={user ? '/dashboard' : '/login'}>{user ? 'Open workspace' : 'Sign in'}</Link>
    </header>
    <main>
      <section className="portal-hero" id="about">
        <div><span className="eyebrow">BSC OPERATIONS WORKSPACE</span><h1>Purchasing,<br />with a clear<br /><em>path forward.</em></h1><p>A connected workspace for the people behind every purchase. Manage products, approvals and deliveries with the details you need, when you need them.</p><Link className="btn primary" to={user ? '/dashboard' : '/login'}>Enter your workspace</Link></div>
        <div className="portal-workflow" aria-label="Purchase order workflow"><div className="portal-workflow-heading"><Icon name="po" size={22} /><span>From planning to receiving</span></div>{workflow.map(item => <article key={item.title}><span className="portal-step-icon"><Icon name={item.icon} size={22} /></span><div><h2>{item.title}</h2><p>{item.body}</p></div></article>)}<p className="portal-workflow-note">Your team. Your permissions. One shared process.</p></div>
      </section>
      <section id="workflow" className="portal-section"><span className="eyebrow">WORK TOGETHER, WITH CONTEXT</span><h2>Everything around the order.</h2><p>Move between your catalogue, purchase register and receiving workflow without losing the details. Your workspace shows the modules and actions assigned to your account.</p></section>
      <section id="features" className="portal-features" aria-label="Workspace capabilities">
        {[['reports','Reports and visibility','Review purchase activity, order status and receiving information.'],['chat','Team coordination','Keep procurement conversations close to the work.'],['audit','Recorded decisions','Review the history of changes and approvals when you need context.']].map(([icon,title,body]) => <article key={title}><Icon name={icon} size={24}/><h3>{title}</h3><p>{body}</p></article>)}
      </section>
    </main>
    <footer className="portal-footer"><span>BSC Exclusive · Purchase Order Management System</span><nav aria-label="Legal"><Link to="/privacy">Privacy</Link><Link to="/terms">Terms</Link><Link to="/security">Security</Link></nav></footer>
  </div>;
}
