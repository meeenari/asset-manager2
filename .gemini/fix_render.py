import os

path = 'js/app.js'
# Try to detect encoding or just use ignore for non-relevant parts
with open(path, 'rb') as f:
    raw = f.read()

# Try common encodings
for enc in ['utf-8', 'cp949', 'euc-kr']:
    try:
        content = raw.decode(enc)
        print(f'Detected encoding: {enc}')
        break
    except:
        continue
else:
    content = raw.decode('utf-8', errors='ignore')
    print('Used utf-8 with ignore')

old_render = '''    render() {
        if (!this.state.isAppUnlocked) {
            this.showLogin();
            return;
        }

        const main = document.getElementById('main-content');

        // Update sidebar active state
        document.querySelectorAll('nav li').forEach(li => {
            li.onclick = () => {
                const page = li.getAttribute('data-page');
                this.state.currentPage = page;
                this.render();
            };
            li.classList.toggle('active', li.getAttribute('data-page') === this.state.currentPage);
        });

        if (this.state.currentPage === 'dashboard-mina' && !this.state.isMinaUnlocked) {
            const template = document.getElementById('tpl-password-prompt');
            main.innerHTML = '';
            main.appendChild(template.content.cloneNode(true));
            this.initPasswordPrompt();
            return;
        }

        const templateId = this.state.currentPage === 'dashboard-mina' ? 'tpl-dashboard' : `tpl-${this.state.currentPage}`;
        const template = document.getElementById(templateId);
        
        if (!template) {
            console.error(`Template not found: ${templateId}`);
            // Fallback to dashboard to prevent white screen
            this.state.currentPage = 'dashboard';
            const fallbackTemplate = document.getElementById('tpl-dashboard');
            if (fallbackTemplate) {
                main.innerHTML = '';
                main.appendChild(fallbackTemplate.content.cloneNode(true));
                this.initDashboard('common');
            }
            return;
        }

        main.innerHTML = '';
        main.appendChild(template.content.cloneNode(true));

        this.updateNavigation();

        if (this.state.currentPage === 'dashboard') this.initDashboard('common');
        if (this.state.currentPage === 'dashboard-mina') this.initDashboard('mina');
        if (this.state.currentPage === 'expenses') this.initExpenses();
        if (this.state.currentPage === 'settings') this.initSettings();
        if (this.state.currentPage === 'pm-summary') this.initPmSummary();
    },

    showLogin() {
        const main = document.getElementById('main-content');
        const template = document.getElementById('tpl-login');
        if (!template) return;
        
        main.innerHTML = '';
        main.appendChild(template.content.cloneNode(true));
        
        const input = document.getElementById('common-pass-input');
        const submit = document.getElementById('common-pass-submit');
        const error = document.getElementById('common-pass-error');
        
        const doLogin = () => {
            if (input.value === this.state.commonPassword) {
                this.state.isAppUnlocked = true;
                this.render();
            } else {
                error.style.display = 'block';
                input.value = '';
                input.focus();
            }
        };

        submit.onclick = doLogin;
        input.onkeypress = (e) => { if (e.key === 'Enter') doLogin(); };
        input.focus();
    },'''

new_render = '''    render() {
        const main = document.getElementById('main-content');
        const aside = document.querySelector('aside');
        const container = document.querySelector('.app-container');

        if (!this.state.isAppUnlocked) {
            if (aside) aside.style.display = 'none';
            if (container) container.style.gridTemplateColumns = '1fr';
            if (main) main.style.maxWidth = '100%';
            this.showLogin();
            return;
        }

        // Restore layout if unlocked
        if (aside) aside.style.display = 'flex';
        if (container) container.style.gridTemplateColumns = '240px 1fr';
        if (main) main.style.maxWidth = '1100px';

        // Update sidebar active state
        document.querySelectorAll('nav li').forEach(li => {
            const page = li.getAttribute('data-page');
            li.classList.toggle('active', page === this.state.currentPage);
            li.onclick = () => {
                this.state.currentPage = page;
                this.render();
            };
        });

        if (this.state.currentPage === 'dashboard-mina' && !this.state.isMinaUnlocked) {
            const template = document.getElementById('tpl-password-prompt');
            if (main && template) {
                main.innerHTML = '';
                main.appendChild(template.content.cloneNode(true));
                this.initPasswordPrompt();
            }
            return;
        }

        const templateId = this.state.currentPage === 'dashboard-mina' ? 'tpl-dashboard' : `tpl-${this.state.currentPage}`;
        const template = document.getElementById(templateId);
        
        if (!template) {
            console.error(`Template not found: ${templateId}`);
            this.state.currentPage = 'dashboard';
            this.render();
            return;
        }

        if (main) {
            main.innerHTML = '';
            main.appendChild(template.content.cloneNode(true));
        }

        this.updateNavigation();

        if (this.state.currentPage === 'dashboard' || this.state.currentPage === 'dashboard-mina') {
            this.initDashboard(this.state.currentPage === 'dashboard' ? 'common' : 'mina');
        }
        if (this.state.currentPage === 'expenses') this.initExpenses();
        if (this.state.currentPage === 'settings') this.initSettings();
        if (this.state.currentPage === 'pm-summary') this.initPmSummary();
    },

    showLogin() {
        const main = document.getElementById('main-content');
        const template = document.getElementById('tpl-login');
        if (!main) return;
        
        if (!template) {
            main.innerHTML = '<div style="padding: 2rem; text-align: center;">로그인 템플릿을 찾을 수 없습니다.</div>';
            return;
        }
        
        main.innerHTML = '';
        main.appendChild(template.content.cloneNode(true));
        
        const input = document.getElementById('common-pass-input');
        const submit = document.getElementById('common-pass-submit');
        const error = document.getElementById('common-pass-error');
        
        if (!input || !submit) return;

        const doLogin = () => {
            if (input.value === this.state.commonPassword) {
                this.state.isAppUnlocked = true;
                this.render();
            } else {
                if (error) error.style.display = 'block';
                input.value = '';
                input.focus();
            }
        };

        submit.onclick = doLogin;
        input.onkeypress = (e) => { if (e.key === 'Enter') doLogin(); };
        input.focus();
    },'''

# Normalize line endings for comparison
def normalize(s):
    return s.replace('\\r\\n', '\\n').replace('\\r', '\\n').strip()

norm_content = normalize(content)
norm_old = normalize(old_render)

if norm_old in norm_content:
    content = content.replace(old_render, new_render)
    # Also try normalized versions
    if old_render not in content:
         # Fallback to a simpler line-by-line or regex if needed, but let's try direct replacement first
         pass
    
    with open(path, 'w', encoding='utf-8') as f:
        f.write(content)
    print('Replacement successful')
else:
    print('Target not found')
