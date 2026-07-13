import { 
  createRoom, joinRoomByCode, fetchUserRooms, fetchRoomDetails, 
  fetchRoomFeed, updateMemberTargets, addRoomComment, inviteUserToRoom,
  supabase 
} from './data/db.js';

// ── Modal Dialog System ──
// Replaces all alert() and prompt() calls with proper blurred-bg modals

function showModal(title, bodyHtml) {
  const modal = document.getElementById('rooms-modal');
  const modalTitle = document.getElementById('modal-title');
  const modalBody = document.getElementById('modal-body');
  modalTitle.textContent = title;
  modalBody.innerHTML = bodyHtml;
  modal.classList.remove('hidden');
}

function hideModal() {
  const modal = document.getElementById('rooms-modal');
  modal.classList.add('hidden');
}

function showRoomToast(message, type = 'success') {
  const existing = document.querySelector('.room-toast');
  if (existing) existing.remove();

  const toast = document.createElement('div');
  toast.className = `room-toast room-toast-${type}`;
  toast.textContent = message;
  document.body.appendChild(toast);
  // Force reflow for animation
  void toast.offsetHeight;
  toast.classList.add('visible');
  setTimeout(() => {
    toast.classList.remove('visible');
    setTimeout(() => toast.remove(), 300);
  }, 3000);
}

/** Shows a modal with an input field and returns a Promise<string|null> */
function promptModal(title, placeholder, submitLabel = 'Submit') {
  return new Promise((resolve) => {
    showModal(title, `
      <input type="text" id="modal-prompt-input" class="modal-input" placeholder="${placeholder}" autocomplete="off">
      <div class="modal-actions">
        <button id="modal-cancel-btn" class="modal-btn modal-btn-secondary">Cancel</button>
        <button id="modal-submit-btn" class="modal-btn modal-btn-primary">${submitLabel}</button>
      </div>
    `);

    const input = document.getElementById('modal-prompt-input');
    const submitBtn = document.getElementById('modal-submit-btn');
    const cancelBtn = document.getElementById('modal-cancel-btn');

    setTimeout(() => input.focus(), 100);

    const cleanup = (value) => {
      hideModal();
      resolve(value);
    };

    submitBtn.addEventListener('click', () => cleanup(input.value.trim() || null));
    cancelBtn.addEventListener('click', () => cleanup(null));
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') cleanup(input.value.trim() || null);
    });
  });
}

export async function initRooms(state, dom) {
  if (!supabase) return;

  // Bind the global modal close button
  const closeBtn = document.getElementById('rooms-modal-close');
  if (closeBtn) closeBtn.addEventListener('click', hideModal);

  // Close modal on backdrop click
  const modal = document.getElementById('rooms-modal');
  if (modal) {
    modal.addEventListener('click', (e) => {
      if (e.target === modal) hideModal();
    });
  }

  // Check if user is in any room
  try {
    const rooms = await fetchUserRooms(state.user.id);
    if (rooms && rooms.length > 0) {
      const activeRoom = rooms[0];
      state.activeRoomId = activeRoom.id;
      state.activeRoomRole = (activeRoom.host_id === state.user.id) ? 'host' : 'member';
      await renderActiveRoom(state, dom);
    } else {
      renderNoRoom();
    }
  } catch (err) {
    console.error('Failed to load rooms:', err);
    renderNoRoom();
  }

  // ── Create Room ──
  const btnCreateRoom = document.getElementById('btn-create-room');
  if (btnCreateRoom) {
    btnCreateRoom.addEventListener('click', async () => {
      const name = await promptModal('Create a Diet Room', 'Enter room name...', 'Create');
      if (!name) return;
      
      btnCreateRoom.disabled = true;
      btnCreateRoom.textContent = 'Creating...';
      try {
        const room = await createRoom(state.user.id, name);
        state.activeRoomId = room.id;
        state.activeRoomRole = 'host';
        showRoomToast(`Room "${name}" created!`);
        await renderActiveRoom(state, dom);
      } catch (e) {
        console.error('Create room error:', e);
        showRoomToast('Failed to create room: ' + e.message, 'error');
      } finally {
        btnCreateRoom.disabled = false;
        btnCreateRoom.textContent = 'Create a Room (Host)';
      }
    });
  }

  // ── Join Room ──
  const btnJoinRoom = document.getElementById('btn-join-room');
  if (btnJoinRoom) {
    btnJoinRoom.addEventListener('click', async () => {
      const code = await promptModal('Join a Room', 'Enter invite code...', 'Join');
      if (!code) return;
      
      btnJoinRoom.disabled = true;
      btnJoinRoom.textContent = 'Joining...';
      try {
        const roomId = await joinRoomByCode(state.user.id, code);
        state.activeRoomId = roomId;
        state.activeRoomRole = 'member';
        showRoomToast('Successfully joined the room!');
        await renderActiveRoom(state, dom);
      } catch (e) {
        console.error('Join room error:', e);
        showRoomToast('Failed to join: ' + e.message, 'error');
      } finally {
        btnJoinRoom.disabled = false;
        btnJoinRoom.textContent = 'Join a Room';
      }
    });
  }

  // ── Invite Members (Host) ──
  const btnInvite = document.getElementById('btn-invite-members');
  if (btnInvite) {
    btnInvite.addEventListener('click', async () => {
      if (!state.activeRoomId) return;
      try {
        const details = await fetchRoomDetails(state.activeRoomId);
        showModal('Invite Members', `
          <div class="invite-code-display">
            <p class="invite-code-label">Share this code</p>
            <div class="invite-code-value">${details.invite_code}</div>
            <button id="copy-invite-code" class="modal-btn modal-btn-secondary" style="margin-top: 8px; width: 100%;">Copy Code</button>
          </div>
          <div class="modal-divider"></div>
          <p class="invite-code-label">Or invite by email</p>
          <input type="email" id="invite-email-input" class="modal-input" placeholder="Enter email address..." autocomplete="off">
          <div class="modal-actions">
            <button id="send-invite-btn" class="modal-btn modal-btn-primary" style="width: 100%;">Send Invite</button>
          </div>
        `);

        document.getElementById('copy-invite-code')?.addEventListener('click', () => {
          navigator.clipboard.writeText(details.invite_code).then(() => {
            showRoomToast('Code copied to clipboard!');
          }).catch(() => {
            // Fallback: select the text
            showRoomToast('Code: ' + details.invite_code);
          });
        });

        document.getElementById('send-invite-btn')?.addEventListener('click', async () => {
          const email = document.getElementById('invite-email-input').value.trim();
          if (!email) return;
          try {
            await inviteUserToRoom(state.activeRoomId, state.user.id, email);
            showRoomToast('Invite sent to ' + email + '!');
            hideModal();
          } catch (e) {
            showRoomToast('Failed to send invite: ' + e.message, 'error');
          }
        });
      } catch (e) {
        console.error('Invite error:', e);
        showRoomToast('Failed to load room details', 'error');
      }
    });
  }

  // ── Manage Members (Host) ──
  const btnMembers = document.getElementById('btn-view-members');
  if (btnMembers) {
    btnMembers.addEventListener('click', async () => {
      if (!state.activeRoomId) return;
      try {
        const details = await fetchRoomDetails(state.activeRoomId);
        const membersHtml = (details.members || []).map(m => {
          const email = m.users?.email || 'Unknown';
          const isHost = m.user_id === details.host_id;
          return `
            <div class="member-row">
              <div class="member-info">
                <span class="member-email">${email}</span>
                ${isHost ? '<span class="badge" style="font-size:10px;">Host</span>' : ''}
              </div>
              <div class="member-targets">
                <span>${m.target_calories || '—'} kcal</span>
              </div>
            </div>
          `;
        }).join('');

        showModal('Room Members', `
          <div class="members-list">${membersHtml || '<p style="color:var(--taupe-gray);">No members yet</p>'}</div>
        `);
      } catch (e) {
        showRoomToast('Failed to load members', 'error');
      }
    });
  }
}

function renderNoRoom() {
  document.getElementById('rooms-no-active')?.classList.remove('hidden');
  document.getElementById('rooms-active')?.classList.add('hidden');
}

export async function renderActiveRoom(state, dom) {
  document.getElementById('rooms-no-active')?.classList.add('hidden');
  const container = document.getElementById('rooms-active');
  if (!container) return;
  container.classList.remove('hidden');

  try {
    const details = await fetchRoomDetails(state.activeRoomId);
    if (!details) {
      renderNoRoom();
      return;
    }

    document.getElementById('active-room-name').textContent = details.name;
    document.getElementById('active-room-role').textContent = 
      state.activeRoomRole === 'host' ? 'Host' : 'Member';

    // Host controls
    const hostControls = document.getElementById('host-controls');
    if (state.activeRoomRole === 'host') {
      hostControls?.classList.remove('hidden');
      const inviteCodeEl = document.getElementById('room-invite-code');
      if (inviteCodeEl) inviteCodeEl.textContent = details.invite_code;
    } else {
      hostControls?.classList.add('hidden');
    }

    // Targets
    const me = (details.members || []).find(m => m.user_id === state.user.id);
    const targetsEl = document.getElementById('room-targets');
    if (me && me.target_calories) {
      targetsEl?.classList.remove('hidden');
      document.getElementById('room-target-calories').textContent = me.target_calories;
      document.getElementById('room-target-protein').textContent = (me.target_protein_g || 0) + 'g';
    } else {
      targetsEl?.classList.add('hidden');
    }

    // Feed
    let feed = [];
    try {
      feed = await fetchRoomFeed(state.activeRoomId);
    } catch (feedErr) {
      console.error('Feed error:', feedErr);
    }
    
    const list = document.getElementById('room-feed-list');
    if (!list) return;
    list.innerHTML = '';
    
    if (feed.length === 0) {
      list.innerHTML = `
        <div style="text-align:center; padding:24px; color:var(--taupe-gray);">
          <p>No meals logged yet.</p>
          <p style="font-size:13px; margin-top:8px;">Members' meal logs will appear here.</p>
        </div>
      `;
      return;
    }

    feed.forEach(log => {
      const el = document.createElement('div');
      el.className = 'room-feed-item';
      
      const email = log.users?.email || 'Unknown';
      const displayName = email.split('@')[0];
      const time = new Date(log.logged_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      const date = new Date(log.logged_at).toLocaleDateString([], { month: 'short', day: 'numeric' });
      
      const itemNames = (log.items || []).map(i => i.food_name_logged).filter(Boolean).join(', ') || 'Meal';
      
      const commentsHtml = (log.comments || []).map(c => `
        <div class="room-comment">
          <span class="comment-author">${(c.users?.email || '').split('@')[0]}</span>
          <span>${c.comment_text}</span>
        </div>
      `).join('');

      el.innerHTML = `
        <div class="feed-item-header">
          <div class="feed-user-info">
            <div class="feed-avatar">${displayName.charAt(0).toUpperCase()}</div>
            <div>
              <div class="feed-username">${displayName}</div>
              <div class="feed-time">${date} · ${time}</div>
            </div>
          </div>
          <div class="feed-calories">${log.total_calculated_calories}<small>kcal</small></div>
        </div>
        <div class="feed-item-body">
          <div class="feed-macros">
            <span>P: ${log.total_protein_g}g</span>
            <span>C: ${log.total_carbs_g}g</span>
            <span>F: ${log.total_fats_g}g</span>
          </div>
          <div class="feed-foods">${itemNames}</div>
        </div>
        <div class="feed-comments">
          ${commentsHtml}
          <div class="comment-input-row">
            <input type="text" class="comment-input" placeholder="Comment..." data-log-id="${log.id}">
            <button class="comment-btn post-comment-btn" data-log-id="${log.id}">→</button>
          </div>
        </div>
      `;
      list.appendChild(el);
    });

    // Bind comment buttons
    list.querySelectorAll('.post-comment-btn').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        const logId = e.target.getAttribute('data-log-id');
        const input = list.querySelector(`input[data-log-id="${logId}"]`);
        if (!input || !input.value.trim()) return;
        
        btn.disabled = true;
        try {
          await addRoomComment(logId, state.user.id, input.value.trim());
          input.value = '';
          showRoomToast('Comment posted');
          await renderActiveRoom(state, dom);
        } catch(err) {
          console.error('Comment error:', err);
          showRoomToast('Failed to post comment', 'error');
        } finally {
          btn.disabled = false;
        }
      });
    });

  } catch (err) {
    console.error('Error rendering active room:', err);
    list = document.getElementById('room-feed-list');
    if (list) {
      list.innerHTML = `
        <div style="text-align:center; padding:24px; color:var(--taupe-gray);">
          <p>Could not load room data.</p>
        </div>
      `;
    }
  }
}
