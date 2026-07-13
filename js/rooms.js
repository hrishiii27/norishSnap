import { 
  createRoom, joinRoomByCode, fetchUserRooms, fetchRoomDetails, 
  fetchRoomFeed, updateMemberTargets, addRoomComment, inviteUserToRoom,
  supabase 
} from './data/db.js';

export async function initRooms(state, dom) {
  if (!supabase) return; // Feature only available if connected to cloud

  // Check if user is in any room and set active room
  try {
    const rooms = await fetchUserRooms(state.user.id);
    if (rooms && rooms.length > 0) {
      // For simplicity, pick the first active room
      const activeRoom = rooms[0];
      state.activeRoomId = activeRoom.id;
      state.activeRoomRole = (activeRoom.host_id === state.user.id) ? 'host' : 'member';
      await renderActiveRoom(state, dom);
    } else {
      renderNoRoom(dom);
    }
  } catch (err) {
    console.error('Failed to load rooms:', err);
  }

  // Bind Events
  const btnCreateRoom = document.getElementById('btn-create-room');
  const btnJoinRoom = document.getElementById('btn-join-room');
  
  if (btnCreateRoom) {
    btnCreateRoom.addEventListener('click', async () => {
      const name = prompt("Enter a name for your Diet Room:");
      if (!name) return;
      try {
        const room = await createRoom(state.user.id, name);
        state.activeRoomId = room.id;
        state.activeRoomRole = 'host';
        alert(`Room "${name}" created! Invite code: ${room.invite_code}`);
        await renderActiveRoom(state, dom);
      } catch (e) {
        alert("Failed to create room: " + e.message);
      }
    });
  }

  if (btnJoinRoom) {
    btnJoinRoom.addEventListener('click', async () => {
      const code = prompt("Enter Room Invite Code:");
      if (!code) return;
      try {
        const room = await joinRoomByCode(state.user.id, code);
        state.activeRoomId = room.id;
        state.activeRoomRole = 'member';
        alert(`Successfully joined room "${room.name}"`);
        await renderActiveRoom(state, dom);
      } catch (e) {
        alert("Failed to join room: " + e.message);
      }
    });
  }

  // Host Controls
  const btnInvite = document.getElementById('btn-invite-members');
  if (btnInvite) {
    btnInvite.addEventListener('click', async () => {
      const details = await fetchRoomDetails(state.activeRoomId);
      const email = prompt(`Room: ${details.name}\nInvite Code: ${details.invite_code}\n\nOr enter email to invite directly:`);
      if (email) {
        try {
          await inviteUserToRoom(state.activeRoomId, state.user.id, email);
          alert("Invite sent!");
        } catch (e) {
          alert("Error: " + e.message);
        }
      }
    });
  }
}

async function renderNoRoom(dom) {
  document.getElementById('rooms-no-active').classList.remove('hidden');
  document.getElementById('rooms-active').classList.add('hidden');
}

export async function renderActiveRoom(state, dom) {
  document.getElementById('rooms-no-active').classList.add('hidden');
  const container = document.getElementById('rooms-active');
  container.classList.remove('hidden');

  try {
    const details = await fetchRoomDetails(state.activeRoomId);
    document.getElementById('active-room-name').textContent = details.name;
    document.getElementById('active-room-role').textContent = state.activeRoomRole === 'host' ? 'Host' : 'Member';

    if (state.activeRoomRole === 'host') {
      document.getElementById('host-controls').classList.remove('hidden');
      document.getElementById('room-invite-code').textContent = details.invite_code;
    } else {
      document.getElementById('host-controls').classList.add('hidden');
    }

    // Targets
    const me = details.members.find(m => m.user_id === state.user.id);
    if (me && me.target_calories) {
      document.getElementById('room-targets').classList.remove('hidden');
      document.getElementById('room-target-calories').textContent = me.target_calories;
      document.getElementById('room-target-protein').textContent = me.target_protein_g + 'g';
    }

    // Feed
    const feed = await fetchRoomFeed(state.activeRoomId);
    const list = document.getElementById('room-feed-list');
    list.innerHTML = '';
    
    feed.forEach(log => {
      const el = document.createElement('div');
      el.className = 'history-item';
      
      const email = log.users?.email || 'Unknown Member';
      const time = new Date(log.logged_at).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
      
      let itemsHtml = log.items.map(i => `<li>${i.input_weight_grams}g ${i.food_name_logged}</li>`).join('');
      let imgHtml = log.image_url_storage_ref && log.image_url_storage_ref.startsWith('http') 
        ? `<img src="${log.image_url_storage_ref}" style="width:100%; border-radius:8px; margin-top:8px;">`
        : '';
        
      let commentsHtml = (log.comments || []).map(c => `
        <div class="room-comment">
          <div class="comment-author">${c.users?.email.split('@')[0]}</div>
          <div>${c.comment_text}</div>
        </div>
      `).join('');

      el.innerHTML = `
        <div style="display:flex; justify-content:space-between;">
          <strong>${email}</strong> <span style="font-size:12px; color:var(--text-secondary)">${time}</span>
        </div>
        <div style="font-size:14px; margin: 4px 0;">
          <strong>${log.total_calculated_calories} kcal</strong> · P: ${log.total_protein_g}g · C: ${log.total_carbs_g}g · F: ${log.total_fats_g}g
        </div>
        <ul style="font-size:13px; color:var(--text-secondary); margin-left:16px;">
          ${itemsHtml}
        </ul>
        ${imgHtml}
        <div class="comments-section" style="margin-top:12px;">
          ${commentsHtml}
          <div class="comment-input-row">
            <input type="text" class="comment-input" placeholder="Add a comment..." data-log-id="${log.id}">
            <button class="comment-btn post-comment-btn" data-log-id="${log.id}">Post</button>
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
        if (input.value.trim()) {
          try {
            await addRoomComment(logId, state.user.id, input.value.trim());
            input.value = '';
            renderActiveRoom(state, dom); // Refresh
          } catch(err) {
            alert('Failed to post comment');
          }
        }
      });
    });

  } catch (err) {
    console.error('Error rendering active room', err);
  }
}
