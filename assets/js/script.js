// BookNook - Main JavaScript File

// Initialize the page
document.addEventListener('DOMContentLoaded', function() {
    // Load books from database
    loadBooks('featured', 'featured-books');
    loadBooks('all', 'all-books');
    loadBooks('bestseller', 'bestseller-books');
    
    // Setup event listeners
    const searchInput = document.getElementById('search-input');
    const searchButton = document.getElementById('search-button');
    
    if (searchInput) {
        searchInput.addEventListener('keypress', function(e) {
            if (e.key === 'Enter') searchBooks();
        });
    }
    
    if (searchButton) {
        searchButton.addEventListener('click', searchBooks);
    }
    
    filterBooksByGenre();
    updateCartCount();
    addNotificationStyles();
});

/**
 * Load books from API and display them
 * @param {string} section - The book section to load (featured, bestseller, etc.)
 * @param {string} containerId - The HTML element ID to display books in
 * @param {string} [genre='all'] - Optional genre filter
 */
function loadBooks(section, containerId, genre = 'all') {
    const url = genre === 'all' 
        ? `/api/books?section=${section}`
        : `/api/books?section=${section}&genre=${encodeURIComponent(genre)}`;
    
    showLoading(containerId);
    
    fetch(url)
        .then(response => {
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            return response.json();
        })
        .then(books => {
            if (!Array.isArray(books)) {
                throw new Error('Invalid books data received');
            }
            
            displayBooks(books, containerId);
        })
        .catch(error => {
            console.error('Error loading books:', error);
            showError(containerId, 'Error loading books. Please try again.');
            showNotification('Error loading books. Please try again.', 'error');
        });
}

/**
 * Display books in the specified container
 * @param {Array} books - Array of book objects
 * @param {string} containerId - HTML element ID to display books in
 */
function displayBooks(books, containerId) {
    const container = document.getElementById(containerId);
    if (!container) {
        console.error('Container not found:', containerId);
        return;
    }

    if (books.length === 0) {
        container.innerHTML = '<p class="no-books">No books found</p>';
        return;
    }

    container.innerHTML = books.map(book => {
        const stars = [1,2,3,4,5].map(i => `<i class="fa fa-star ${i <= Math.round(book.rating||0) ? 'filled' : ''}"></i>`).join('');
        const out = Number(book.stock||0) <= 0;
        return `
        <div class="book-card" data-id="${book.book_id}">
            <img src="${book.cover_image}" alt="${book.title}"
                 onerror="this.onerror=null; this.src='https://images.unsplash.com/photo-1544947950-fa07a98d237f?ixlib=rb-1.2.1&auto=format&fit=crop&w=400&h=600&q=80'">
            <div class="book-info">
                <h3><a href="/book/${book.book_id}">${book.title}</a></h3>
                <p class="author">by ${book.author}</p>
                <div class="stars small">${stars}</div>
                <p class="price">BDT ${Number(book.price).toFixed(2)}</p>
                <span class="genre">${book.genre}</span>
                <button class="btn-primary add-to-cart" data-book-id="${book.book_id}" ${out ? 'disabled' : ''}>${out ? 'Out of Stock' : 'Add to Cart'}</button>
                <button class="btn-secondary wishlist-toggle" data-book-id="${book.book_id}"><i class="fa fa-heart"></i></button>
            </div>
        </div>`;
    }).join('');

    addAddToCartListeners();
    addWishlistListeners();
}

/**
 * Search books based on user input
 */
function searchBooks() {
    const query = document.getElementById('search-input').value.trim();
    window.location.href = '/search?q=' + encodeURIComponent(query);
}

/**
 * Set up genre filter buttons
 */
function filterBooksByGenre() {
    const genreTags = document.querySelectorAll('.genre-tag');
    
    genreTags.forEach(tag => {
        tag.addEventListener('click', function() {
            genreTags.forEach(t => t.classList.remove('active'));
            this.classList.add('active');
            
            const genre = this.getAttribute('data-genre');
            loadBooks('all', 'all-books', genre);
        });
    });
}

/**
 * Add event listeners to all Add to Cart buttons
 */
function addAddToCartListeners() {
    document.querySelectorAll('.add-to-cart').forEach(button => {
        button.addEventListener('click', function() {
            const bookId = parseInt(this.closest('.book-card').getAttribute('data-id'));
            addToCart(bookId);
        });
    });
}

/**
 * Add event listeners to wishlist toggle buttons
 */
function addWishlistListeners() {
    document.querySelectorAll('.wishlist-toggle').forEach(button => {
        button.addEventListener('click', async function() {
            if (!isLoggedIn()) {
                showNotification('Please login to use wishlist', 'error');
                window.location.href = '/login';
                return;
            }
            const bookId = parseInt(this.getAttribute('data-book-id'));
            const r = await fetch('/api/wishlist/add', {
                method: 'POST',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                body: `book_id=${bookId}`
            });
            const d = await r.json();
            if (d.success) { showNotification('Added to wishlist'); this.classList.add('active'); }
            else showNotification(d.message || 'Failed', 'error');
        });
    });
}

/**
 * Add a book to cart via API
 * @param {number} bookId - ID of the book to add
 */
function addToCart(bookId) {
    if (!isLoggedIn()) {
        showNotification('Please login to add items to cart', 'error');
        window.location.href = '/login';
        return;
    }

    fetch('/api/cart/add', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: `book_id=${bookId}`
    })
    .then(response => {
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        return response.json();
    })
    .then(data => {
        if (data.success) {
            showNotification(data.message || 'Item added to cart');
            updateCartCount();
        } else {
            showNotification(data.message || 'Failed to add to cart', 'error');
        }
    })
    .catch(error => {
        console.error('Error adding to cart:', error);
        showNotification('Error adding to cart. Please try again.', 'error');
    });
}

/**
 * Update cart count in the header
 */
function updateCartCount() {
    fetch('/api/cart')
        .then(response => {
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            return response.json();
        })
        .then(data => {
            if (data.success) {
                const count = data.items ? data.items.length : 0;
                document.querySelectorAll('#cart-count').forEach(el => {
                    el.textContent = count;
                });
            }
        })
        .catch(error => {
            console.error('Error updating cart count:', error);
        });
}

/**
 * Show a notification message
 * @param {string} message - Message to display
 * @param {string} [type='success'] - Type of notification (success, error)
 */
function showNotification(message, type = 'success') {
    const notification = document.createElement('div');
    notification.className = `notification ${type}`;
    notification.textContent = message;
    document.body.appendChild(notification);
    
    setTimeout(() => {
        notification.classList.add('show');
    }, 10);
    
    setTimeout(() => {
        notification.classList.remove('show');
        setTimeout(() => {
            document.body.removeChild(notification);
        }, 300);
    }, 3000);
}

/**
 * Check if user is logged in
 * @returns {boolean} True if logged in
 */
function isLoggedIn() {
    return document.querySelector('.login-btn')?.textContent.trim() === 'Logout';
}

/**
 * Add notification styles to the page
 */
function addNotificationStyles() {
    const style = document.createElement('style');
    style.textContent = `
        .notification {
            position: fixed;
            bottom: 20px;
            left: 50%;
            transform: translateX(-50%);
            background-color: #2ecc71;
            color: white;
            padding: 15px 25px;
            border-radius: 5px;
            box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
            opacity: 0;
            transition: opacity 0.3s ease;
            z-index: 1000;
        }
        .notification.show {
            opacity: 1;
        }
        .notification.error {
            background-color: #e74c3c;
        }
        .loading {
            text-align: center;
            padding: 20px;
            color: #7f8c8d;
        }
        .error-message {
            text-align: center;
            padding: 20px;
            color: #e74c3c;
        }
        .no-books {
            text-align: center;
            padding: 20px;
            color: #7f8c8d;
        }
    `;
    document.head.appendChild(style);
}

/**
 * Show loading state in a container
 * @param {string} containerId - ID of the container to show loading in
 */
function showLoading(containerId) {
    const container = document.getElementById(containerId);
    if (container) {
        container.innerHTML = '<div class="loading">Loading books...</div>';
    }
}

/**
 * Show error message in a container
 * @param {string} containerId - ID of the container to show error in
 * @param {string} message - Error message to display
 */
function showError(containerId, message) {
    const container = document.getElementById(containerId);
    if (container) {
        container.innerHTML = `<div class="error-message">${message}</div>`;
    }
}