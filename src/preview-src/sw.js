self.addEventListener('fetch', function (event) {
  console.log('Intercepted request for:', event.request.url);

  // Example: Modify requests or responses as needed
  // Here, we simply pass through the request
  event.respondWith(
    fetch(event.request)
      .then(function (response) {
        // Optionally, you can modify the response here
        return response;
      })
      .catch(function (error) {
        console.error('Fetch error:', error);
        // Optionally, return a fallback response
        return new Response('Network error occurred', {
          status: 408,
          headers: { 'Content-Type': 'text/plain' },
        });
      })
  );
});
