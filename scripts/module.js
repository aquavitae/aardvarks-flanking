import * as flanking from './flanking.js'

function getAttackToHit(wrapped) {
  return flanking.getAttackToHit(this, wrapped());
}

Hooks.once('ready', () => {
  if (!game.modules.get('lib-wrapper')?.active && game.user.isGM) {
    ui.notifications.error("aardvarks-flanking requires the 'libWrapper' module. Please install and activate it.");
  }
});

Hooks.once('setup', async () => {
  Hooks.on('targetToken', async (user, target, state) => {
    await flanking.onTargetToken(user, target, state);
  });

  Hooks.on('updateToken', async (...args) => {
    await flanking.onUpdateToken(...args);
  });

  libWrapper.register(flanking.moduleName, 'CONFIG.Item.documentClass.prototype.getAttackToHit', getAttackToHit, 'WRAPPER');
});

Hooks.once('init', async () => {
  game.settings.register(flanking.moduleName, flanking.maxFlankingBonusSetting, {
    name: `AARDVARKS-FLANKING.settings.${flanking.maxFlankingBonusSetting}.Name`,
    default: 4,
    type: Number,
    scope: 'world',
    config: true,
    hint: `AARDVARKS-FLANKING.settings.${flanking.maxFlankingBonusSetting}.Hint`,
  });
})