import { createApp } from 'vue';
import { createPinia } from 'pinia';
import App from './App.vue';
import router from './router';
import 'highlight.js/styles/atom-one-dark.css';
import './styles/variables.scss';

createApp(App).use(createPinia()).use(router).mount('#app');
