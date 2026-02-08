'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { formatDate } from '@/lib/utils/formatters';

export default function StudentList() {
  const [students, setStudents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const router = useRouter();

  useEffect(() => {
    const token = localStorage.getItem('speakalize_admin_token');
    if (!token) {
      router.push('/admin');
      return;
    }

    fetch('/api/admin/students', {
      headers: { 'Authorization': `Bearer ${token}` }
    })
      .then(res => {
        if (!res.ok) {
          localStorage.removeItem('speakalize_admin_token');
          router.push('/admin');
          return null;
        }
        return res.json();
      })
      .then(data => {
        if (data) {
          setStudents(data.students || []);
        }
        setLoading(false);
      })
      .catch(() => {
        setError('Failed to load students');
        setLoading(false);
      });
  }, [router]);

  function handleLogout() {
    localStorage.removeItem('speakalize_admin_token');
    router.push('/admin');
  }

  if (loading) {
    return (
      <div className="container-wide text-center" style={{ marginTop: '4rem' }}>
        <p className="text-secondary">Loading...</p>
      </div>
    );
  }

  return (
    <div className="container-wide">
      <div className="flex justify-between items-center mb-3">
        <div>
          <h1>Students</h1>
          <p className="text-secondary">{students.length} registered students</p>
        </div>
        <button className="btn btn-secondary" onClick={handleLogout}>Logout</button>
      </div>

      {error && <p className="error-text mb-2">{error}</p>}

      <div className="card" style={{ padding: 0, overflow: 'auto' }}>
        <table className="table">
          <thead>
            <tr>
              <th>Student ID</th>
              <th>Name</th>
              <th>Sessions</th>
              <th>Avg WPM</th>
              <th>Last Practice</th>
            </tr>
          </thead>
          <tbody>
            {students.length === 0 ? (
              <tr>
                <td colSpan={5} className="text-center text-secondary" style={{ padding: '2rem' }}>
                  No students registered yet
                </td>
              </tr>
            ) : (
              students.map(student => (
                <tr
                  key={student.student_id}
                  onClick={() => router.push(`/admin/students/${student.student_id}`)}
                >
                  <td><strong>{student.student_id}</strong></td>
                  <td>{student.display_name || '-'}</td>
                  <td>{student.total_sessions}</td>
                  <td>{student.avg_wpm ?? '-'}</td>
                  <td>{student.latest_session_date ? formatDate(student.latest_session_date) : '-'}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
