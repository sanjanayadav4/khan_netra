/**
 * KhanNetra — Email verification removed.
 * This route stub redirects to login so old bookmarks / links don't 404.
 * Registration now uses admin-approval workflow — no email verification needed.
 */
import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

export default function VerifyEmail() {
  const navigate = useNavigate();
  useEffect(() => { navigate('/login', { replace: true }); }, [navigate]);
  return null;
}
