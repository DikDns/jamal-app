import { useNavigate } from 'react-router-dom';
import './NotFoundPage.css';

function NotFoundPage() {
    const navigate = useNavigate();

    return (
        <div className="not-found-page">
            <div className="not-found-content">
                <img src="/logo.svg" alt="Jamal Logo" className="not-found-logo" />
                <h1>404</h1>
                <p>Oops! This page doesn't exist.</p>
                <button className="back-button" onClick={() => navigate('/')}>
                    Go Home
                </button>
            </div>
        </div>
    );
}

export default NotFoundPage;
