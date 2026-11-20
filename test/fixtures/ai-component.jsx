import React, { useState } from 'react';

// Hero component for the landing page
const Hero = () => {
  // Initialize the state for the email input
  const [email, setEmail] = useState('');

  // Handle the form submission
  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      // Send the email to the API
      await fetch('/api/subscribe', { method: 'POST', body: JSON.stringify({ email }) });
      console.log('✅ Subscribed successfully!');
    } catch (error) {
      console.error('Something went wrong:', error);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-500 via-purple-500 to-pink-500">
      {/* Hero Section */}
      <section className="container mx-auto px-6 py-24 text-center">
        <h1 className="text-6xl font-bold bg-gradient-to-r from-purple-400 to-pink-600 bg-clip-text text-transparent">
          Supercharge Your Workflow
        </h1>
        <p className="mt-6 text-xl text-white/80">
          The next-gen platform that empowers teams to build faster. Join 50,000+ developers who trust us.
        </p>
        <form onSubmit={handleSubmit} className="mt-8 backdrop-blur-lg bg-white/10 rounded-2xl p-4">
          <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Enter your email" />
          <button type="submit">Get Started Free</button>
        </form>
      </section>
      {/* ... rest of the sections */}
    </div>
  );
};

export default Hero;
